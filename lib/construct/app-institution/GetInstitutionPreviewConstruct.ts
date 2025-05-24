import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";

export interface GetInstitutionPreviewConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
    readonly appDomainName: string
}

export class GetInstitutionPreviewConstruct extends Construct {

    public readonly getInstitutionPreviewLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: GetInstitutionPreviewConstructProps) {
        super(scope, id);

        // Get Institution lambda
        this.getInstitutionPreviewLambda = new lambdaNode.NodejsFunction(this, "GetInstitutionPreviewsLambda", {
            functionName: `crm-${props.envName}-get-institution-preview-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/institution-preview-handler.ts"),
            handler: "institutionPreviewGetHandler",
            environment: {
                APP_DOMAIN: props.appDomainName,
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.getInstitutionPreviewLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn
                ]
            })
        );
    }
}