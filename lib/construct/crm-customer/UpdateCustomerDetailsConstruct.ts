import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface UpdateCustomerDetailsConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class UpdateCustomerDetailsConstruct extends Construct {

    public readonly updateCustomerDetailsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: UpdateCustomerDetailsConstructProps) {
        super(scope, id);

        // Get Customer lambda
        this.updateCustomerDetailsLambda = new lambdaNode.NodejsFunction(this, "UpdateCustomerDetailsLambda", {
            functionName: `crm-${props.envName}-update-customer-details-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/customer-handler.ts"),
            handler: "customerDetailsUpdateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.updateCustomerDetailsLambda.addToRolePolicy(
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