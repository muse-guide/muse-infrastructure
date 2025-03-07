import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetInstitutionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class GetInstitutionConstruct extends Construct {

    public readonly getInstitutionLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetInstitutionConstructProps) {
        super(scope, id);

        // Get Institution lambda
        this.getInstitutionLambda = new lambdaNode.NodejsFunction(this, "GetInstitutionLambda", {
            functionName: `crm-${props.envName}-get-institution-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/institution-handler.ts"),
            handler: "institutionGetHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
            }
        });
        props.storage.crmAssetBucket.grantRead(this.getInstitutionLambda);

        this.getInstitutionLambda.addToRolePolicy(
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