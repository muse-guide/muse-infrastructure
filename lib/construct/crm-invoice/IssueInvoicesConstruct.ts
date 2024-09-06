import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from 'aws-cdk-lib/aws-events';
import {LambdaFunction} from 'aws-cdk-lib/aws-events-targets';

import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface IssueInvoicesConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class IssueInvoicesConstruct extends Construct {

    public readonly issueInvoicesLambda: lambdaNode.NodejsFunction
    private readonly eventRule: events.Rule

    constructor(scope: Construct, id: string, props: IssueInvoicesConstructProps) {
        super(scope, id);

        this.issueInvoicesLambda = new lambdaNode.NodejsFunction(this, "IssueInvoicesLambda", {
            functionName: `crm-${props.envName}-issue-invoices-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/invoice-manager.ts"),
            handler: "handler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });

        this.issueInvoicesLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );

        const rule = new events.Rule(this, 'Rule', {
            schedule: events.Schedule.cron({
                year: "*",
                month: "*",
                day: "1",
                hour: "1",
                minute: "1",
            }),
        });

        rule.addTarget(new LambdaFunction(this.issueInvoicesLambda));
    }
}