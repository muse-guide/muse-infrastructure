import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetInvoicesConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetInvoicesConstruct extends Construct {

    public readonly getInvoicesLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetInvoicesConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getInvoicesLambda = new lambdaNode.NodejsFunction(this, "GetInvoicesLambda", {
            functionName: `crm-${props.envName}-get-invoices-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/invoice-manager.ts"),
            handler: "invoicesGetHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.getInvoicesLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
    }
}