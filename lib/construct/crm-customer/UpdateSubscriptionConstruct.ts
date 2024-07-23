import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface UpdateSubscriptionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class UpdateSubscriptionConstruct extends Construct {

    public readonly updateSubscriptionLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: UpdateSubscriptionConstructProps) {
        super(scope, id);

        // Update Subscription lambda
        this.updateSubscriptionLambda = new lambdaNode.NodejsFunction(this, "UpdateSubscriptionLambda", {
            functionName: `crm-${props.envName}-update-subscription-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/customer-handler.ts"),
            handler: "subscriptionUpdateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.updateSubscriptionLambda.addToRolePolicy(
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