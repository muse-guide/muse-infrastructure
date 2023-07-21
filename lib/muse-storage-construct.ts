import * as cdk from 'aws-cdk-lib';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface MuseStorageConstructProps extends cdk.StackProps {
    readonly envName: string
}

export class MuseStorageConstruct extends Construct {

    public readonly exhibitTable: dynamodb.Table
    public readonly exhibitionTable: dynamodb.Table
    public readonly assetBucket: awss3.Bucket
    public readonly assetBucketOai: cloudfront.OriginAccessIdentity

    constructor(scope: Construct, id: string, props: MuseStorageConstructProps) {
        super(scope, id);

        // Exhibit table
        this.exhibitTable = new dynamodb.Table(this, `MuseExhibitTable`, {
            tableName: `muse-exhibit-table-${props.envName}`,
            partitionKey: {
                name: 'id', type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'lang', type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY // TODO: replace for production
        });

        // Exhibition table
        this.exhibitionTable = new dynamodb.Table(this, `MuseExhibitionTable`, {
            tableName: `muse-exhibition-table-${props.envName}`,
            partitionKey: {
                name: 'id', type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'lang', type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY // TODO: replace for production
        });

        // Asset bucket
        this.assetBucket = new awss3.Bucket(this, 'AssetBucket', {
            bucketName: `muse-asset-bucket-${props.envName}`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true
        })
        this.assetBucketOai = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity');
        this.assetBucket.grantRead(this.assetBucketOai);
    }
}