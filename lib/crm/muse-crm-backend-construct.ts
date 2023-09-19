import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface MuseCrmBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly crmStorage: MuseCrmStorageConstruct
}

export class MuseCrmBackendConstruct extends Construct {

    public readonly crmGetExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.crmGetExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionLambda", {
            functionName: `crm-${props.envName}-get-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/get-exhibition.handler.ts"),
            environment: {
                EXHIBITION_TABLE: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Create Exhibition lambda
        this.crmCreateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionLambda", {
            functionName: `crm-${props.envName}-create-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/create-exhibition.handler.ts"),
            environment: {
                EXHIBITION_TABLE: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );
    }
}