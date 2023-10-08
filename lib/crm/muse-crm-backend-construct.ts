import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import {LogLevel, StateMachineType} from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from "path";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";

export interface MuseCrmBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly crmStorage: MuseCrmStorageConstruct
}

export class MuseCrmBackendConstruct extends Construct {

    public readonly crmGetExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmGetExhibitionsLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionSnapshotLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.crmGetExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionLambda", {
            functionName: `crm-${props.envName}-get-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/get-exhibition.handler.ts"),
            environment: {
                EXHIBITION_TABLE_NAME: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Get Exhibitions lambda
        this.crmGetExhibitionsLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionsLambda", {
            functionName: `crm-${props.envName}-get-exhibitions-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/get-exhibitions.handler.ts"),
            environment: {
                EXHIBITION_TABLE_NAME: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionsLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Create Exhibition lambda
        this.crmCreateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionLambda", {
            functionName: `crm-${props.envName}-create-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/create-exhibition.handler.ts"),
            environment: {
                EXHIBITION_TABLE_NAME: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmCreateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Create Exhibition Snapshot lambda
        this.crmCreateExhibitionSnapshotLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionSnapshotLambda", {
            functionName: `crm-${props.envName}-create-exhibition-snapshot-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/create-exhibition-snapshot.handler.ts"),
            environment: {
                EXHIBITION_SNAPSHOT_TABLE_NAME: props.crmStorage.crmExhibitionSnapshotTable.tableName
            }
        });
        this.crmCreateExhibitionSnapshotLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionSnapshotTable.tableArn]
            })
        );

        const createExhibitionLogGroup = new LogGroup(this, 'CrmCreateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // Crete Exhibition Step Function
        this.crmCreateExhibitionStateMachine = new step.StateMachine(this, 'CreateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibition-state-machine`,
            stateMachineType: StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitionLogGroup,
                level: LogLevel.ALL,
                includeExecutionData: true,
            },
            definition: new tasks.LambdaInvoke(this, "CreateExhibition",
                {
                    lambdaFunction: this.crmCreateExhibitionLambda,
                    outputPath: '$.Payload',
                }
            )
                .next(new tasks.LambdaInvoke(this, "CreateExhibitionSnapshot",
                    {
                        lambdaFunction: this.crmCreateExhibitionSnapshotLambda,
                        outputPath: '$.Payload',
                    }
                ))
                .next(new step.Succeed(this, "Created"))
        });
    }
}