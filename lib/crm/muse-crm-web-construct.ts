import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import {ApiGatewayConstruct} from "../common/api-gateway-construct";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import {join} from "path";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import {CognitoConstruct} from "../common/cognito-construct";
import {MuseCrmBackendConstruct} from "./muse-crm-backend-construct";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface MuseCrmWebConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly crmBackend: MuseCrmBackendConstruct
    readonly crmStorage: MuseCrmStorageConstruct
}

export class MuseCrmWebConstruct extends Construct {

    public readonly crmDistribution: cloudfront.Distribution
    constructor(scope: Construct, id: string, props: MuseCrmWebConstructProps) {
        super(scope, id);

        // App frontend infrastructure definition
        const crmUiBucket = new awss3.Bucket(this, "CrmUiBucket", {
            bucketName: `crm-${props.envName}-ui-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true // TODO: replace for production
        });
        const crmUiOriginAccessIdentity = new cloudfront.OriginAccessIdentity(this, "CrmUiOriginAccessIdentity");
        crmUiBucket.grantRead(crmUiOriginAccessIdentity);

        // Cognito user pool
        const crmCognito = new CognitoConstruct(this, "CrmCognito", {
            envName: props.envName,
            application: "crm"
        });

        const customerAssetUrl = "arn:aws:s3:::" + props.crmStorage.crmAssetBucket.bucketName + "/private/${cognito-identity.amazonaws.com:sub}/*"
        crmCognito.authenticatedRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:DeleteObject"
                ],
                resources: [customerAssetUrl],
            })
        )

        // API Gateway definition
        const crmApiGateway = new ApiGatewayConstruct(this, "CrmApiGateway", {
                envName: props.envName,
                application: "crm"
            }
        );
        const crmApiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "CrmCognitoAuthorizer", {
            authorizerName: `crm-${props.envName}-cognito-authorizer`,
            cognitoUserPools: [crmCognito.userPool]
        });

        const crmApiRoot = crmApiGateway.api.root.addResource("v1");
        const crmExhibitionEndpoint = crmApiRoot.addResource("exhibitions")
        const rootIdResource = crmExhibitionEndpoint.addResource("{id}")

        crmExhibitionEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.crmBackend.crmGetExhibitionsLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitionEndpoint.addMethod("POST", apigateway.StepFunctionsIntegration.startExecution(props.crmBackend.crmCreateExhibitionStateMachine, {
            requestTemplates: {"application/json": mappingTemplate(props.crmBackend.crmCreateExhibitionStateMachine.stateMachineArn)}
        }), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        rootIdResource.addMethod("GET", new apigateway.LambdaIntegration(props.crmBackend.crmGetExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        rootIdResource.addMethod("DELETE", apigateway.StepFunctionsIntegration.startExecution(props.crmBackend.crmDeleteExhibitionStateMachine, {
            requestTemplates: {"application/json": mappingTemplate(props.crmBackend.crmDeleteExhibitionStateMachine.stateMachineArn)}
        }), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        rootIdResource.addMethod("PUT", apigateway.StepFunctionsIntegration.startExecution(props.crmBackend.crmUpdateExhibitionStateMachine, {
            requestTemplates: {"application/json": mappingTemplate(props.crmBackend.crmUpdateExhibitionStateMachine.stateMachineArn)}
        }), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        // Add Distribution to front API GW, mobile app and asset S3 bucket
        this.crmDistribution = new cloudfront.Distribution(this, "CrmDistribution", {
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            defaultRootObject: "index.html",
            defaultBehavior: {
                origin: new origins.S3Origin(crmUiBucket, {originAccessIdentity: crmUiOriginAccessIdentity}),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: "/index.html",
                    ttl: cdk.Duration.seconds(0)
                }
            ],
            additionalBehaviors: {
                "v1/*": {
                    origin: new origins.RestApiOrigin(crmApiGateway.api, {
                        customHeaders: {
                            "x-api-key": crmApiGateway.apiKey
                        }
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    originRequestPolicy: cloudfront.OriginRequestPolicy.fromOriginRequestPolicyId(this, 'AllViewerExceptHostHeader', 'b689b0a8-53d0-40ab-baf2-68738e2966ac')
                },
                "asset/*": {
                    origin: new origins.S3Origin(props.crmStorage.crmAssetBucket, {originAccessIdentity: props.crmStorage.crmAssetBucketOai}),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                }
            }
        });

        // App S3 deployment
        const crmUiBucketDeployment = new s3Deployment.BucketDeployment(this, "CrmUiBucketDeployment", {
            destinationBucket: crmUiBucket,
            sources: [s3Deployment.Source.asset(join(__dirname, "../../../muse-crm-client/build"))],
            distribution: this.crmDistribution
        });

        // Outputs
        new cdk.CfnOutput(this, "CrmDistributionUrl", {value: this.crmDistribution.distributionDomainName});
    }
}

const mappingTemplate = (stateMachineArn: string) =>
    `
    #set($inputString = '')
    #set($allParams = $input.params())
    {
        "stateMachineArn": "${stateMachineArn}",
        #set($inputString = "$inputString,@@body@@: $input.body")
        #set($inputString = "$inputString,@@sub@@: @@$context.authorizer.claims.sub@@")
        #set($inputString = "$inputString,@@identityId@@: @@$allParams.header.identityid@@")
       
        #set($inputString = "$inputString, @@path@@:{")
        #foreach($paramName in $allParams.path.keySet())
            #set($inputString = "$inputString @@$paramName@@: @@$util.escapeJavaScript($allParams.path.get($paramName))@@")
            #if($foreach.hasNext)
                #set($inputString = "$inputString,")
            #end
        #end
        #set($inputString = "$inputString }")
            
        #set($inputString = "$inputString, @@querystring@@:{")
        #foreach($paramName in $allParams.querystring.keySet())
            #set($inputString = "$inputString @@$paramName@@: @@$util.escapeJavaScript($allParams.querystring.get($paramName))@@")
            #if($foreach.hasNext)
                #set($inputString = "$inputString,")
            #end
        #end
        #set($inputString = "$inputString }")
            
        #set($inputString = "$inputString, @@header@@:{")
        #foreach($paramName in $allParams.header.keySet())
            #set($inputString = "$inputString @@$paramName@@: @@$util.escapeJavaScript($allParams.header.get($paramName))@@")
            #if($foreach.hasNext)
                #set($inputString = "$inputString,")
            #end
        #end
        #set($inputString = "$inputString }")
        
        #set($inputString = "$inputString}")
        #set($inputString = $inputString.replaceAll("@@",'"'))
        #set($len = $inputString.length() - 1)
        "input": "{$util.escapeJavaScript($inputString.substring(1,$len)).replaceAll("\\'","'")}"
    }
`