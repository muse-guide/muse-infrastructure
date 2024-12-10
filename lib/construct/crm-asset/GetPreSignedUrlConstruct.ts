import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";

export interface GetPreSignedUrlConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetPreSignedUrlConstruct extends Construct {

    public readonly getPreSignedUrlLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetPreSignedUrlConstructProps) {
        super(scope, id);

        // Generate Audio Preview lambda
        this.getPreSignedUrlLambda = new lambdaNode.NodejsFunction(this, "GetPreSignedUrlLambda", {
            functionName: `crm-${props.envName}-get-pre-signed-url-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/asset-manager.ts"),
            handler: "generateGetPreSignedUrlHandler",
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
            }
        });
        props.storage.crmAssetBucket.grantReadWrite(this.getPreSignedUrlLambda);
    }
}