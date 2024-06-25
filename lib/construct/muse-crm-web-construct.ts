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
import {MuseCrmBackendConstruct} from "./muse-crm-backend-construct";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";
import {CognitoConstruct} from "./crm-exhibition/CognitoConstruct";

export interface MuseCrmWebConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly backend: MuseCrmBackendConstruct
    readonly storage: MuseCrmStorageConstruct
}

const API_KEY = "884a1685-00b6-4f79-80d6-5f01499f25f4"

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
            application: "crm",
            storage: props.storage
        });

        const customerAssetUrl = "arn:aws:s3:::" + props.storage.crmAssetBucket.bucketName + "/private/${cognito-identity.amazonaws.com:sub}/*"
        const tmpAssetUrl = "arn:aws:s3:::" + props.storage.crmAssetBucket.bucketName + "/public/tmp/*"
        crmCognito.authenticatedRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:DeleteObject"
                ],
                resources: [
                    customerAssetUrl,
                    tmpAssetUrl
                ],
            })
        )

        // API Gateway definition
        const crmApiGateway = new ApiGatewayConstruct(this, "CrmApiGateway", {
                envName: props.envName,
                application: "crm",
                apiKey: API_KEY
            }
        );
        const crmApiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "CrmCognitoAuthorizer", {
            authorizerName: `crm-${props.envName}-cognito-authorizer`,
            cognitoUserPools: [crmCognito.userPool]
        });

        const crmApiRoot = crmApiGateway.api.root.addResource("v1");

        // Exhibition resources
        const crmExhibitionEndpoint = crmApiRoot.addResource("exhibitions")
        const crmExhibitionIdEndpoint = crmExhibitionEndpoint.addResource("{id}")

        crmExhibitionEndpoint.addMethod("POST", new apigateway.LambdaIntegration(props.backend.createExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitionIdEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitionEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitionsLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitionIdEndpoint.addMethod("DELETE", new apigateway.LambdaIntegration(props.backend.deleteExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitionIdEndpoint.addMethod("PUT", new apigateway.LambdaIntegration(props.backend.updateExhibitionLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        // Exhibit resources
        const crmExhibitEndpoint = crmApiRoot.addResource("exhibits")
        const crmExhibitIdEndpoint = crmExhibitEndpoint.addResource("{id}")

        crmExhibitEndpoint.addMethod("POST", new apigateway.LambdaIntegration(props.backend.createExhibitLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitIdEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitsLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitIdEndpoint.addMethod("DELETE", new apigateway.LambdaIntegration(props.backend.deleteExhibitLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        crmExhibitIdEndpoint.addMethod("PUT", new apigateway.LambdaIntegration(props.backend.updateExhibitLambda), {
            authorizer: crmApiAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });

        // Audio resources
        const crmAudioEndpoint = crmApiRoot.addResource("audio")

        crmAudioEndpoint.addMethod("POST", new apigateway.LambdaIntegration(props.backend.generateAudioPreviewLambda), {
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
                            "x-api-key": API_KEY
                        }
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    originRequestPolicy: cloudfront.OriginRequestPolicy.fromOriginRequestPolicyId(this, 'AllViewerExceptHostHeader', 'b689b0a8-53d0-40ab-baf2-68738e2966ac')
                },
                "asset/*": {
                    origin: new origins.S3Origin(props.storage.crmAssetBucket, {originAccessIdentity: props.storage.crmAssetBucketOai}),
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
    }
}