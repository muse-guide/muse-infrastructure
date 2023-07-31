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

    public readonly crmExhibitionLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Exhibition lambda
        this.crmExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmExhibitionLambda", {
            functionName: `crm-${props.envName}-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../../src/crm/exhibition-definition.ts"),
            environment: {
                EXHIBIT_TABLE: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );
    }
}