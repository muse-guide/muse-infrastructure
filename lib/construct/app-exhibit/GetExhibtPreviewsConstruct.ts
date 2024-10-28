import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitPreviewsConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetExhibitPreviewsConstruct extends Construct {

    public readonly getExhibitPreviewsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitPreviewsConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getExhibitPreviewsLambda = new lambdaNode.NodejsFunction(this, "GetExhibitPreviewsLambda", {
            functionName: `crm-${props.envName}-get-exhibit-previews-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-preview-handler.ts"),
            handler: "exhibitPreviewsGetHandler",
            environment: {
                APP_DOMAIN: "https://duz68kh4juaad.cloudfront.net",
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            },
            bundling: {
                minify: true,
            },
        });
        this.getExhibitPreviewsLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:Query"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
    }
}