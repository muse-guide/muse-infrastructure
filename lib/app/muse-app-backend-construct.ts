import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {Construct} from "constructs";
import * as path from "path";
import {MuseAppStorageConstruct} from "./muse-app-storage-construct";

export interface MuseAppBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly appStorage: MuseAppStorageConstruct
}

export class MuseAppBackendConstruct extends Construct {

    public readonly appExhibitionLambda: lambdaNode.NodejsFunction

    public readonly appExhibitLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseAppBackendConstructProps) {
        super(scope, id);

        // App backend infrastructure definition
        this.appExhibitLambda = new lambdaNode.NodejsFunction(this, "AppExhibitLambda", {
            functionName: `app-${props.envName}-exhibit-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../../src/app/exhibit.ts"),
            handler: "handler",
            environment: {
                EXHIBIT_TABLE: props.appStorage.appExhibitTable.tableName
            }
        });
        this.appExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"],
                resources: [props.appStorage.appExhibitTable.tableArn]
            })
        );

        this.appExhibitionLambda = new lambdaNode.NodejsFunction(this, "AppExhibitionLambda", {
            functionName: `app-${props.envName}-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: path.join(__dirname, "../../src/app/exhibition.ts"),
            handler: "handler",
            environment: {
                EXHIBITION_TABLE: props.appStorage.appExhibitionTable.tableName
            }
        });
        this.appExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:GetItem"],
                resources: [props.appStorage.appExhibitionTable.tableArn]
            })
        );
    }
}