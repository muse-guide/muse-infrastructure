import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { ApiGatewayConstruct } from "./api-gateway-construct";
import * as path from "path";
import { join } from "path";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export interface MuseAppConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly exhibitTable: dynamodb.Table,
    readonly exhibitionTable: dynamodb.Table,
    readonly assetBucket: awss3.Bucket
    readonly assetBucketOai: cloudfront.OriginAccessIdentity
}

export class MuseAppConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MuseAppConstructProps) {
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

        // App backend infrastructure definition
        const appExhibitLambda = new lambdaNode.NodejsFunction(this, "AppExhibitLambda", {
            functionName: `app-${props.envName}-exhibit-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../src/app/exhibit.ts"),
            handler: "handler",
            environment: {
                EXHIBIT_TABLE: props.exhibitTable.tableName
            }
        });
        appExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"],
                resources: [props.exhibitTable.tableArn]
            })
        );

        const appExhibitionLambda = new lambdaNode.NodejsFunction(this, "AppExhibitionLambda", {
            functionName: `app-${props.envName}-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../src/app/exhibition.ts"),
            handler: "handler",
            environment: {
                EXHIBITION_TABLE: props.exhibitionTable.tableName
            }
        });
        appExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"],
                resources: [props.exhibitionTable.tableArn]
            })
        );

        // API Gateway definition
        const appApiGateway = new ApiGatewayConstruct(this, "AppApiGateway", {
                envName: props.envName,
                application: "app"
            }
        );
        const appApiRoot = appApiGateway.api.root.addResource("v1");
        const appExhibitEndpoint = appApiRoot
            .addResource("exhibits")
            .addResource("{id}")
            .addResource("{lang}");
        appExhibitEndpoint.addMethod("GET", new apigateway.LambdaIntegration(appExhibitLambda));
        const appExhibitionEndpoint = appApiRoot
            .addResource("exhibitions")
            .addResource("{id}")
            .addResource("{lang}");
        appExhibitionEndpoint.addMethod("GET", new apigateway.LambdaIntegration(appExhibitionLambda));

        // Add Distribution to front API GW, mobile app and asset S3 bucket
        const appDistribution = new cloudfront.Distribution(this, "Distribution", {
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            defaultRootObject: "index.html",
            defaultBehavior: {
                origin: new origins.S3Origin(appUiBucket, { originAccessIdentity: appUiOriginAccessIdentity }),
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
                            "x-api-key": appApiGateway.apiKey
                        }
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED // TODO enable caching
                },
                "asset/*": {
                    origin: new origins.S3Origin(props.assetBucket, { originAccessIdentity: props.assetBucketOai }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
                }
            }
        });

        // App S3 deployment
        const appUiBucketDeployment = new s3Deployment.BucketDeployment(this, "AppUiBucketDeployment", {
            destinationBucket: appUiBucket,
            sources: [s3Deployment.Source.asset(join(__dirname, "../src/app/client/build"))],
            distribution: appDistribution
        });

        // Outputs
        new cdk.CfnOutput(this, "AppDistributionUrl", { value: appDistribution.distributionDomainName });
    }
}