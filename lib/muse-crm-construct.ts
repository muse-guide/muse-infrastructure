import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { ApiGatewayConstruct } from "./api-gateway-construct";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { join } from "path";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import { CognitoConstruct } from "./cognito-construct";

export interface MuseCrmConstructProps extends cdk.StackProps {
    readonly envName: string,
}

export class MuseCrmConstruct extends Construct {

    constructor(scope: Construct, id: string, props: MuseCrmConstructProps) {
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

        // App backend infrastructure definition
        const crmExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmExhibitionLambda", {
            functionName: `crm-${props.envName}-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../src/crm/exhibition-definition.ts"),
            handler: "handler"
        });

        // Cognito user pool
        const crmCognito = new CognitoConstruct(this, "CrmCognito", {
            envName: props.envName,
            application: "crm"
        });

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
        const crmExhibitionEndpoint = crmApiRoot
            .addResource("exhibitions")
            .addResource("{id}");

        crmExhibitionEndpoint.addMethod("GET", new apigateway.LambdaIntegration(crmExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });


        // Add Distribution to front API GW, mobile app and asset S3 bucket
        const crmDistribution = new cloudfront.Distribution(this, "CrmDistribution", {
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            defaultRootObject: "index.html",
            defaultBehavior: {
                origin: new origins.S3Origin(crmUiBucket, { originAccessIdentity: crmUiOriginAccessIdentity })
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
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    originRequestPolicy: cloudfront.OriginRequestPolicy.fromOriginRequestPolicyId(this, 'AllViewerExceptHostHeader', 'b689b0a8-53d0-40ab-baf2-68738e2966ac')
                }
            }
        });

        // App S3 deployment
        const crmUiBucketDeployment = new s3Deployment.BucketDeployment(this, "CrmUiBucketDeployment", {
            destinationBucket: crmUiBucket,
            sources: [s3Deployment.Source.asset(join(__dirname, "../../muse-crm-client/build"))],
            distribution: crmDistribution
        });

        // Outputs
        new cdk.CfnOutput(this, "CrmDistributionUrl", { value: crmDistribution.distributionDomainName });
    }
}