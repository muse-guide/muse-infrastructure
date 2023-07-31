import * as cdk from 'aws-cdk-lib';
import {Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {MuseCrmWebConstruct} from "./crm/muse-crm-web-construct";

export interface InfrastructureStackProps extends cdk.StackProps {
    readonly envName: string
}

export class InfrastructureStack extends Stack {
    constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
        super(scope, id, props);

        // const storage = new MuseStorageConstruct(this, "MuseStorageConstruct", {
        //     envName: props.envName
        // })
        //
        // const app = new MuseAppConstruct(this, "MuseAppConstruct", {
        //     envName: props.envName,
        //     exhibitTable: storage.exhibitTable,
        //     exhibitionTable: storage.exhibitionTable,
        //     assetBucket: storage.assetBucket,
        //     assetBucketOai: storage.assetBucketOai,
        // })

        const crm = new MuseCrmWebConstruct(this, "MuseCrmConstruct", {
            envName: props.envName
        })
    }
}