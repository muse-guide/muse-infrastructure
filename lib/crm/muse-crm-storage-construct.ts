import * as cdk from 'aws-cdk-lib';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface MuseCrmStorageConstructProps extends cdk.StackProps {
    readonly envName: string
}

export class MuseCrmStorageConstruct extends Construct {
    public readonly crmExhibitionTable: dynamodb.Table
    public readonly crmAssetBucket: awss3.Bucket
    public readonly crmAssetBucketOai: cloudfront.OriginAccessIdentity

    constructor(scope: Construct, id: string, props: MuseCrmStorageConstructProps) {
        super(scope, id);

        // Exhibition table
        this.crmExhibitionTable = new dynamodb.Table(this, `CrmExhibitionTable`, {
            tableName: `crm-${props.envName}-exhibition-table`,
            partitionKey: {
                name: 'id', type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'customerId', type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY // TODO: replace for production
        });

        // Asset bucket
        this.crmAssetBucket = new awss3.Bucket(this, 'CrmAssetBucket', {
            bucketName: `crm-${props.envName}-asset-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true
        })
        this.crmAssetBucketOai = new cloudfront.OriginAccessIdentity(this, 'CrmOriginAccessIdentity');
        this.crmAssetBucket.grantRead(this.crmAssetBucketOai);
    }
}