import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface MuseAppBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseAppBackendConstruct extends Construct {

    public readonly appGetExhibitionLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseAppBackendConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.appGetExhibitionLambda = new lambdaNode.NodejsFunction(this, "AppGetExhibitionLambda", {
            functionName: `app-${props.envName}-get-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-preview-handler.ts"),
            handler: "exhibitionGetHandler",
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.appGetExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"],
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );
    }
}