import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitPreviewConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetExhibitPreviewConstruct extends Construct {

    public readonly getExhibitPreviewLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitPreviewConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getExhibitPreviewLambda = new lambdaNode.NodejsFunction(this, "GetExhibitPreviewsLambda", {
            functionName: `crm-${props.envName}-get-exhibit-preview-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-preview-handler.ts"),
            handler: "exhibitPreviewGetHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            },
            bundling: {
                minify: true,
            },
        });
        this.getExhibitPreviewLambda.addToRolePolicy(
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