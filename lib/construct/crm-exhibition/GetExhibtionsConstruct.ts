import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetExhibitionsConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetExhibitionsConstruct extends Construct {

    public readonly getExhibitionsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetExhibitionsConstructProps) {
        super(scope, id);

        // Get Exhibitionion lambda
        this.getExhibitionsLambda = new lambdaNode.NodejsFunction(this, "GetExhibitionsLambda", {
            functionName: `crm-${props.envName}-get-exhibitions-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionGetAllHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.getExhibitionsLambda.addToRolePolicy(
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