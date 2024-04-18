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
    public readonly crmImageProcessorLambda: lambdaNode.NodejsFunction
    public readonly crmDeleteAssetLambda: lambdaNode.NodejsFunction
    public readonly crmQrCodeGeneratorLambda: lambdaNode.NodejsFunction
    public readonly crmAudioProcessorLambda: lambdaNode.NodejsFunction

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
        this.crmImageProcessorLambda = new lambdaNode.NodejsFunction(this, "CrmImageProcessorLambda", {
            functionName: `crm-${props.envName}-image-processor-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            timeout: cdk.Duration.seconds(30),
            entry: path.join(__dirname, "../../../muse-crm-server/src/image-processor.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantReadWrite(this.crmImageProcessorLambda);
        props.storage.appAssetBucket.grantReadWrite(this.crmImageProcessorLambda);

        // Audio processor
        this.crmAudioProcessorLambda = new lambdaNode.NodejsFunction(this, "CrmAudioProcessorLambda", {
            functionName: `crm-${props.envName}-audio-processor-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/audio-processor.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantReadWrite(this.crmAudioProcessorLambda);
        props.storage.appAssetBucket.grantReadWrite(this.crmAudioProcessorLambda);

        const pollySynthesizeSpeechPolicyStatement = new iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech'],
            resources: ['*'],
        });

        this.crmAudioProcessorLambda.role?.attachInlinePolicy(
            new iam.Policy(this, 'SynthesizeSpeechPolicy', {
                statements: [pollySynthesizeSpeechPolicyStatement],
            }),
        );

        // QR code generator
        this.crmQrCodeGeneratorLambda = new lambdaNode.NodejsFunction(this, "CrmQrCodeGeneratorLambda", {
            functionName: `crm-${props.envName}-qr-code-generator-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/qr-code-generator.ts"),
            environment: {
                APP_DOMAIN: "https://duz68kh4juaad.cloudfront.net",
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket
            .grantWrite(this.crmQrCodeGeneratorLambda);

        // Delete asset hadler
        this.crmDeleteAssetLambda = new lambdaNode.NodejsFunction(this, "CrmDeleteAssetLambda", {
            functionName: `crm-${props.envName}-delete-asset-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/delete-asset.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantDelete(this.crmDeleteAssetLambda);
        props.storage.appAssetBucket.grantDelete(this.crmDeleteAssetLambda);
    }
}