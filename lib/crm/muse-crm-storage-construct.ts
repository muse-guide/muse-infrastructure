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
    public readonly crmExhibitionSnapshotTable: dynamodb.Table // TODO: rename to app
    public readonly crmAssetBucket: awss3.Bucket
    public readonly crmAssetBucketOai: cloudfront.OriginAccessIdentity
    public readonly appAssetBucket: awss3.Bucket
    public readonly appAssetBucketOai: cloudfront.OriginAccessIdentity

    constructor(scope: Construct, id: string, props: MuseCrmStorageConstructProps) {
        super(scope, id);

        // Exhibition table
        this.crmExhibitionTable = new dynamodb.Table(this, `CrmExhibitionTable`, {
            tableName: `crm-${props.envName}-exhibition-table`,
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY // TODO: replace for production
        });
        this.crmExhibitionTable.addGlobalSecondaryIndex({
            indexName: 'gsi1pk-gsi1sk-index',
            partitionKey: {
                name: 'gsi1pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'gsi1sk',
                type: dynamodb.AttributeType.STRING
            }
        })

        // Exhibition snapshot table
        this.crmExhibitionSnapshotTable = new dynamodb.Table(this, `CrmExhibitionSnapshotTable`, {
            tableName: `crm-${props.envName}-exhibition-snapshot-table`,
            partitionKey: {
                name: 'id', type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'lang', type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY // TODO: replace for production
        });

        // Private asset bucket
        this.crmAssetBucket = new awss3.Bucket(this, 'CrmAssetBucket', {
            bucketName: `crm-${props.envName}-asset-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true,
            cors: [{
                "allowedMethods": [
                    awss3.HttpMethods.HEAD,
                    awss3.HttpMethods.GET,
                    awss3.HttpMethods.PUT,
                    awss3.HttpMethods.POST,
                    awss3.HttpMethods.DELETE,
                ],
                "allowedOrigins": ["*"], // TODO tighten permissions!!!!
                "allowedHeaders": ["*"],
            }]
        })
        this.crmAssetBucketOai = new cloudfront.OriginAccessIdentity(this, 'CrmOriginAccessIdentity');
        this.crmAssetBucket.grantRead(this.crmAssetBucketOai);

        // Public asset bucket
        this.appAssetBucket = new awss3.Bucket(this, 'AppAssetBucket', {
            bucketName: `app-${props.envName}-asset-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true,
            cors: [{
                "allowedMethods": [
                    awss3.HttpMethods.HEAD,
                    awss3.HttpMethods.GET,
                ],
                "allowedOrigins": ["*"], // TODO tighten permissions!!!!
                "allowedHeaders": ["*"],
            }]
        })
        this.appAssetBucketOai = new cloudfront.OriginAccessIdentity(this, 'AppOriginAccessIdentity');
        this.appAssetBucket.grantRead(this.appAssetBucketOai);
    }
}