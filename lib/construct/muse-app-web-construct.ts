import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import {Construct} from "constructs";
import {ApiGatewayConstruct} from "../common/api-gateway-construct";
import {MuseAppBackendConstruct} from "./muse-app-backend-construct";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {join} from "path";

export interface MuseAppWebConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly backend: MuseAppBackendConstruct
    readonly storage: MuseCrmStorageConstruct
}

const API_KEY = "91f5ee14-07d0-46b3-8700-41ecdd4f6305"

export class MuseAppWebConstruct extends Construct {

    public readonly appDistribution: cloudfront.Distribution

    constructor(scope: Construct, id: string, props: MuseAppWebConstructProps) {
        super(scope, id);

        // App frontend infrastructure definition
        const appUiBucket = new awss3.Bucket(this, "AppUiBucket", {
            bucketName: `app-${props.envName}-ui-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true // TODO: replace for production
        });
        const appUiOriginAccessIdentity = new cloudfront.OriginAccessIdentity(this, "AppUiOriginAccessIdentity");
        appUiBucket.grantRead(appUiOriginAccessIdentity);

        // API Gateway definition
        const appApiGateway = new ApiGatewayConstruct(this, "AppApiGateway", {
                envName: props.envName,
                application: "app",
                apiKey: API_KEY
            }
        );
        const appApiRoot = appApiGateway.api.root.addResource("v1");

        // Exhibition resources
        const appExhibitionEndpoint = appApiRoot
            .addResource("exhibitions")
            .addResource("{id}")

        appExhibitionEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitionPreviewLambda));

        // Exhibit resources
        const appExhibitEndpoint = appApiRoot.addResource("exhibits")
        const appExhibitIdEndpoint = appExhibitEndpoint.addResource("{id}")

        appExhibitEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitPreviewsLambda));

        appExhibitIdEndpoint.addMethod("GET", new apigateway.LambdaIntegration(props.backend.getExhibitPreviewLambda));

        // Add Distribution to front API GW, mobile app and asset S3 bucket
        this.appDistribution = new cloudfront.Distribution(this, "AppDistribution", {
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            defaultRootObject: "index.html",
            defaultBehavior: {
                origin: new origins.S3Origin(appUiBucket, {originAccessIdentity: appUiOriginAccessIdentity}),
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
                    origin: new origins.RestApiOrigin(appApiGateway.api, {
                        customHeaders: {
                            "x-api-key": API_KEY
                        }
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // TODO enable caching
                    originRequestPolicy: new cloudfront.OriginRequestPolicy(this, 'AppOriginRequestPolicy', {
                        cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
                        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.allowList(
                            'lang',
                            'exhibition-id',
                            'page-size',
                            'next-page-key',
                            'number'
                        ),
                    })
                },
                "asset/*": {
                    origin: new origins.S3Origin(props.storage.appAssetBucket, {originAccessIdentity: props.storage.appAssetBucketOai}),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
                }
            }
        });

        // App S3 deployment
        const appUiBucketDeployment = new s3Deployment.BucketDeployment(this, "AppUiBucketDeployment", {
            destinationBucket: appUiBucket,
            sources: [s3Deployment.Source.asset(join(__dirname, "../../../muse-app-client/build"))],
            distribution: this.appDistribution
        });
    }
}