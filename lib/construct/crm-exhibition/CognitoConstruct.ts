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
    readonly identityPool: cognito.CfnIdentityPool;
    readonly authenticatedRole: iam.Role;
    readonly createCustomerLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: CognitoConstructProps) {
        super(scope, id);

        this.userPool = new cognito.UserPool(this, "UserPool", {
            userPoolName: `${props.application}-${props.envName}-cognito-user-pool`,
            signInAliases: {email: true, username: false},
            selfSignUpEnabled: true,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const appClient = this.userPool.addClient("AppClient", {
            userPoolClientName: `${props.application}-${props.envName}-cognito-user-pool-client`,
            authFlows: {
                userSrp: true,
                adminUserPassword: true
            }
        });

        this.identityPool = new cognito.CfnIdentityPool(this, "IdentityPool", {
            allowUnauthenticatedIdentities: false, // Don't allow unathenticated users
            cognitoIdentityProviders: [
                {
                    clientId: appClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                },
            ],
        });

        this.authenticatedRole = new iam.Role(this, "CognitoDefaultAuthenticatedRole", {
            assumedBy: new iam.FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                {
                    StringEquals: {
                        "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "authenticated",
                    },
                },
                "sts:AssumeRoleWithWebIdentity"
            ),
        });

        new cognito.CfnIdentityPoolRoleAttachment(
            this,
            "IdentityPoolRoleAttachment",
            {
                identityPoolId: this.identityPool.ref,
                roles: {authenticated: this.authenticatedRole.roleArn},
            }
        );

        // Get Exhibition lambda
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
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );

        this.userPool.addTrigger(
            cognito.UserPoolOperation.POST_CONFIRMATION,
            this.createCustomerLambda
        );
    }
}
