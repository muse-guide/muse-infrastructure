import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";

export interface GetConfigurationConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetConfigurationConstruct extends Construct {

    public readonly getConfigurationLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetConfigurationConstructProps) {
        super(scope, id);

        // Get Configuration lambda
        this.getConfigurationLambda = new lambdaNode.NodejsFunction(this, "GetConfigurationLambda", {
            functionName: `crm-${props.envName}-get-configuration-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/configuration-handler.ts"),
            handler: "configurationGetHandler",
        });
    }
}