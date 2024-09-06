import * as cdk from "aws-cdk-lib";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {Construct} from "constructs";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import * as iam from "aws-cdk-lib/aws-iam";

export interface ExposableLambdaProps extends cdk.StackProps {
    readonly lambdaName: string,
    readonly lambdaHandlerFile: string,
    readonly lambdaHandlerName: string,
    readonly environmentVariables: { [p: string]: string } | undefined

    readonly storage: MuseCrmStorageConstruct
}

export class ExposableLambdaConstruct extends Construct {

    public readonly getInvoicesLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: ExposableLambdaProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getInvoicesLambda = new lambdaNode.NodejsFunction(this, "GetInvoicesLambda", {
            functionName: props.lambdaName,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, props.lambdaHandlerFile),
            handler: props.lambdaHandlerName,
            environment: props.environmentVariables
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