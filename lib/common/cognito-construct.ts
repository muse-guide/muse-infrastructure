import {Construct} from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import {RemovalPolicy} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

export interface CognitoConstructProps {
    envName: string;
    application: string;
}

export class CognitoConstruct extends Construct {

    readonly userPool: cognito.UserPool;
    readonly identityPool: cognito.CfnIdentityPool;
    readonly authenticatedRole: iam.Role;

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
    }
}
