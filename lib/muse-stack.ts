import * as cdk from "aws-cdk-lib";
import {Stack} from "aws-cdk-lib";
import {Construct} from "constructs";
import {MuseCrmBackendConstruct} from "./construct/muse-crm-backend-construct";
import {MuseCrmStorageConstruct} from "./construct/muse-crm-storage-construct";
import {MuseCrmWebConstruct} from "./construct/muse-crm-web-construct";
import {MuseAppBackendConstruct} from "./construct/muse-app-backend-construct";
import {MuseAppWebConstruct} from "./construct/muse-app-web-construct";

export interface MuseCrmStackProps extends cdk.StackProps {
    readonly envName: string,
    readonly domainName: string,
    readonly certificateArn: string,
}

export class MuseStack extends Stack {
    constructor(scope: Construct, id: string, props: MuseCrmStackProps) {
        super(scope, id);

        // Crm storage
        const crmStorage = new MuseCrmStorageConstruct(this, "CrmStorage", {
            envName: props.envName
        })

        // Crm backend
        const crmBackend = new MuseCrmBackendConstruct(this, "CrmBackend", {
            envName: props.envName,
            storage: crmStorage,
            appDomainName: `app.${props.domainName}`,
        })

        // Crm web
        const crmWeb = new MuseCrmWebConstruct(this, "CrmWeb", {
            envName: props.envName,
            backend: crmBackend,
            storage: crmStorage,
            consoleDomainName: `console.${props.domainName}`,
            certificateArn: props.certificateArn,
        })

        // App backend
        const appBackend = new MuseAppBackendConstruct(this, "AppBackend", {
            envName: props.envName,
            storage: crmStorage,
            appDomainName: `app.${props.domainName}`,
        })

        // App web
        const appWeb = new MuseAppWebConstruct(this, "AppWeb", {
            envName: props.envName,
            backend: appBackend,
            storage: crmStorage,
            appDomainName: `app.${props.domainName}`,
            certificateArn: props.certificateArn,
        })

        // Outputs
        new cdk.CfnOutput(this, "CrmDistributionUrl", {value: crmWeb.crmDistribution.distributionDomainName});
        new cdk.CfnOutput(this, "AppDistributionUrl", {value: appWeb.appDistribution.distributionDomainName});
    }
}