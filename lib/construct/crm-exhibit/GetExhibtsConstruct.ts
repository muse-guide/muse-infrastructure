import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitsConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetExhibitsConstruct extends Construct {

    public readonly getExhibitsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitsConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.getExhibitsLambda = new lambdaNode.NodejsFunction(this, "GetExhibitsLambda", {
            functionName: `crm-${props.envName}-get-exhibits-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-handler.ts"),
            handler: "exhibitGetAllHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.getExhibitsLambda.addToRolePolicy(
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