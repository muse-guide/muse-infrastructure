import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitionPreviewConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetExhibitionPreviewConstruct extends Construct {

    public readonly getExhibitionPreviewLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitionPreviewConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getExhibitionPreviewLambda = new lambdaNode.NodejsFunction(this, "GetExhibitionPreviewsLambda", {
            functionName: `crm-${props.envName}-get-exhibition-preview-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-preview-handler.ts"),
            handler: "exhibitionPreviewGetHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.getExhibitionPreviewLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
    }
}