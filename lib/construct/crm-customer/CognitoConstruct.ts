import {Construct} from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import {RemovalPolicy} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";

export interface CognitoConstructProps {
    readonly envName: string;
    readonly application: string;
    readonly storage: MuseCrmStorageConstruct
}

export class CognitoConstruct extends Construct {

    readonly userPool: cognito.UserPool;
    readonly createCustomerLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: CognitoConstructProps) {
        super(scope, id);

        this.userPool = new cognito.UserPool(this, "UserPool", {
            userPoolName: `${props.application}-${props.envName}-cognito-user-pool`,
            signInAliases: {email: true, username: false},
            selfSignUpEnabled: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const appClient = this.userPool.addClient("AppClient", {
            userPoolClientName: `${props.application}-${props.envName}-cognito-user-pool-client`,
            authFlows: {
                userSrp: true,
                adminUserPassword: true
            }
        })

        // Create Customer lambda
        this.createCustomerLambda = new lambdaNode.NodejsFunction(this, "CreateCustomerLambda", {
            functionName: `crm-${props.envName}-create-customer-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/customer-handler.ts"),
            handler: "customerCreateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName
            }
        });
        this.createCustomerLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );

        this.userPool.addTrigger(
            cognito.UserPoolOperation.POST_CONFIRMATION,
            this.createCustomerLambda
        );
    }
}
