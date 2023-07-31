import * as cdk from "aws-cdk-lib";
import {Stack} from "aws-cdk-lib";
import {Construct} from "constructs";
import {MuseCrmBackendConstruct} from "./muse-crm-backend-construct";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {MuseCrmWebConstruct} from "./muse-crm-web-construct";

export interface MuseCrmStackProps extends cdk.StackProps {
    readonly envName: string,
}

export class MuseCrmStack extends Stack {
    constructor(scope: Construct, id: string, props: MuseCrmStackProps) {
        super(scope, id);

        // Crm storage
        const crmStorage = new MuseCrmStorageConstruct(this, "CrmStorage", {
            envName: props.envName
        })

        // Crm backend
        const crmBackend = new MuseCrmBackendConstruct(this, "CrmBackend", {
            envName: props.envName,
            crmStorage: crmStorage
        })

        // Crm web
        const crmWeb = new MuseCrmWebConstruct(this, "CrmWeb", {
            envName: props.envName,
            crmBackend: crmBackend,
            crmStorage: crmStorage
        })

        // Outputs
        new cdk.CfnOutput(this, "CrmDistributionUrl", {value: crmWeb.crmDistribution.distributionDomainName});
    }
}