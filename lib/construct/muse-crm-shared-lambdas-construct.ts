import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";

export interface MuseCrmCommonLambdasConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseCrmSharedLambdasConstruct extends Construct {

    public readonly errorHandlerLambda: lambdaNode.NodejsFunction
    public readonly imageProcessorLambda: lambdaNode.NodejsFunction
    public readonly deleteAssetLambda: lambdaNode.NodejsFunction
    public readonly qrCodeGeneratorLambda: lambdaNode.NodejsFunction
    public readonly audioProcessorLambda: lambdaNode.NodejsFunction
    public readonly cdnManagerLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseCrmCommonLambdasConstructProps) {
        super(scope, id);

        // Error handler
        this.errorHandlerLambda = new lambdaNode.NodejsFunction(this, "ErrorHandlerLambdaLambda", {
            functionName: `crm-${props.envName}-error-handler-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/error-handler.ts")
        });

        // Image processor
        this.imageProcessorLambda = new lambdaNode.NodejsFunction(this, "CrmImageProcessorLambda", {
            functionName: `crm-${props.envName}-image-processor-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/image-processor.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            },
            timeout: cdk.Duration.seconds(120),
            memorySize: 512
        });
        props.storage.crmAssetBucket.grantReadWrite(this.imageProcessorLambda);
        props.storage.appAssetBucket.grantReadWrite(this.imageProcessorLambda);

        // Audio processor
        this.audioProcessorLambda = new lambdaNode.NodejsFunction(this, "CrmAudioProcessorLambda", {
            functionName: `crm-${props.envName}-audio-processor-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/audio-processor.ts"),
            timeout: cdk.Duration.seconds(180),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantReadWrite(this.audioProcessorLambda);
        props.storage.appAssetBucket.grantReadWrite(this.audioProcessorLambda);

        const pollySynthesizeSpeechPolicyStatement = new iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech'],
            resources: ['*'],
        });

        this.audioProcessorLambda.role?.attachInlinePolicy(
            new iam.Policy(this, 'SynthesizeSpeechPolicy', {
                statements: [pollySynthesizeSpeechPolicyStatement],
            }),
        );

        // QR code generator
        this.qrCodeGeneratorLambda = new lambdaNode.NodejsFunction(this, "CrmQrCodeGeneratorLambda", {
            functionName: `crm-${props.envName}-qr-code-generator-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/qr-code-generator.ts"),
            timeout: cdk.Duration.seconds(180),
            environment: {
                APP_DOMAIN: "https://duz68kh4juaad.cloudfront.net",
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket
            .grantWrite(this.qrCodeGeneratorLambda);

        // Delete asset handler
        this.deleteAssetLambda = new lambdaNode.NodejsFunction(this, "CrmDeleteAssetLambda", {
            functionName: `crm-${props.envName}-delete-asset-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/delete-asset.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantDelete(this.deleteAssetLambda);
        props.storage.appAssetBucket.grantDelete(this.deleteAssetLambda);

        // CDN manager
        const distributionId = 'E3C5VVIK6TDVAL'; // TODO deliver it nicer
        const cdnArn = `arn:aws:cloudfront::654493660708:distribution/${distributionId}`; // TODO deliver it nicer
        this.cdnManagerLambda = new lambdaNode.NodejsFunction(this, "AppCdnManager", {
            functionName: `crm-${props.envName}-cdn-manager-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/cdn-manager.ts"),
            environment: {
                APP_DISTRIBUTION_ID: distributionId
            },
            timeout: cdk.Duration.seconds(120),
        });

        const createInvalidationPolicyStatement = new iam.PolicyStatement({
            actions: ['cloudfront:CreateInvalidation'],
            effect: iam.Effect.ALLOW,
            resources: [cdnArn],
        });

        this.cdnManagerLambda.role?.attachInlinePolicy(
            new iam.Policy(this, 'CreateInvalidationPolicy', {
                statements: [createInvalidationPolicyStatement],
            }),
        );
    }
}