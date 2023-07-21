import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { RemovalPolicy } from "aws-cdk-lib";

export interface CognitoConstructProps {
    envName: string;
    application: string;
}

export class CognitoConstruct extends Construct {

    readonly userPool: UserPool;

    constructor(scope: Construct, id: string, props: CognitoConstructProps) {
        super(scope, id);

        this.userPool = new UserPool(this, "UserPool", {
            userPoolName: `${props.application}-${props.envName}-cognito-user-pool`,
            signInAliases: { email: true },
            selfSignUpEnabled: true,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const appClient = this.userPool.addClient("AppClient", {
            userPoolClientName: `${props.application}-${props.envName}-cognito-user-pool-client`,
            authFlows: { userSrp: true }
        });
    }
}
