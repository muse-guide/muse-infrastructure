import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface AudioPreviewConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class AudioPreviewConstruct extends Construct {

    public readonly audioPreviewLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: AudioPreviewConstructProps) {
        super(scope, id);

        // Generate Audio Preview lambda
        this.audioPreviewLambda = new lambdaNode.NodejsFunction(this, "AudioPreviewLambda", {
            functionName: `crm-${props.envName}-audio-preview-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/audio-preview-handler.ts"),
            handler: "generateAudioPreviewHandler",
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
            }
        });
        props.storage.crmAssetBucket.grantReadWrite(this.audioPreviewLambda);

        const pollySynthesizeSpeechPolicyStatement = new iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech'],
            resources: ['*'],
        });

        this.audioPreviewLambda.role?.attachInlinePolicy(
            new iam.Policy(this, 'AudioPreviewSynthesizeSpeechPolicy', {
                statements: [pollySynthesizeSpeechPolicyStatement],
            }),
        );
    }
}