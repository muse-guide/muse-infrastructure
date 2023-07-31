import * as cdk from 'aws-cdk-lib';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as awss3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface MuseStorageConstructProps extends cdk.StackProps {
    readonly envName: string
}

export class MuseAppStorageConstruct extends Construct {

    public readonly appExhibitTable: dynamodb.Table
    public readonly appExhibitionTable: dynamodb.Table
    public readonly appAssetBucket: awss3.Bucket
    public readonly appAssetBucketOai: cloudfront.OriginAccessIdentity

    constructor(scope: Construct, id: string, props: MuseStorageConstructProps) {
        super(scope, id);

        // Exhibit table
        this.appExhibitTable = new dynamodb.Table(this, `AppExhibitTable`, {
            tableName: `app-${props.envName}-exhibit-table}`,
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
        this.appExhibitionTable = new dynamodb.Table(this, `AppExhibitionTable`, {
            tableName: `app-${props.envName}-exhibition-table`,
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
        this.appAssetBucket = new awss3.Bucket(this, 'AppAssetBucket', {
            bucketName: `app-${props.envName}-asset-bucket`,
            accessControl: awss3.BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY, // TODO: replace for production
            autoDeleteObjects: true
        })
        this.appAssetBucketOai = new cloudfront.OriginAccessIdentity(this, 'AppOriginAccessIdentity');
        this.appAssetBucket.grantRead(this.appAssetBucketOai);
    }
}