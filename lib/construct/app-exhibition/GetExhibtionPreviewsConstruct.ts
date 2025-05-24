import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitionPreviewsConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
    readonly appDomainName: string
}

export class GetExhibitionPreviewsConstruct extends Construct {

    public readonly getExhibitionPreviewsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitionPreviewsConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getExhibitionPreviewsLambda = new lambdaNode.NodejsFunction(this, "GetExhibitionPreviewsLambda", {
            functionName: `crm-${props.envName}-get-exhibition-previews-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-preview-handler.ts"),
            handler: "exhibitionPreviewsGetHandler",
            environment: {
                APP_DOMAIN: props.appDomainName,
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            },
            bundling: {
                minify: true,
            },
        });
        this.getExhibitionPreviewsLambda.addToRolePolicy(
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