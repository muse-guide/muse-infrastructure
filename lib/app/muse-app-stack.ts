import * as cdk from "aws-cdk-lib";
import {Stack} from "aws-cdk-lib";
import {Construct} from "constructs";
import {MuseAppBackendConstruct} from "./muse-app-backend-construct";
import {MuseAppStorageConstruct} from "./muse-app-storage-construct";
import {MuseAppWebConstruct} from "./muse-app-web-construct";

export interface MuseAppStackProps extends cdk.StackProps {
    readonly envName: string,
}

export class MuseAppStack extends Stack {
    constructor(scope: Construct, id: string, props: MuseAppStackProps) {
        super(scope, id);

        // App storage
        const appStorage = new MuseAppStorageConstruct(this, "AppStorage", {
            envName: props.envName
        })

        // App backend
        const appBackend = new MuseAppBackendConstruct(this, "AppBackend", {
            envName: props.envName,
            appStorage: appStorage
        })

        // App web
        const appWeb = new MuseAppWebConstruct(this, "AppWeb", {
            envName: props.envName,
            appBackend: appBackend,
            appStorage: appStorage
        })

        // Outputs
        new cdk.CfnOutput(this, "AppDistributionUrl", {value: appWeb.appDistribution.distributionDomainName});
    }
}