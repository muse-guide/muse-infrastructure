import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as step from "aws-cdk-lib/aws-stepfunctions";
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
    public readonly crmDeleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmUpdateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionStateMachine: step.StateMachine
    public readonly crmDeleteExhibitionStateMachine: step.StateMachine
    public readonly crmUpdateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Get Exhibition lambda
        this.crmGetExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionLambda", {
            functionName: `crm-${props.envName}-get-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-get.handler.ts"),
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
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-get-all.handler.ts"),
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
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-create.handler.ts"),
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

        // Delete Exhibition lambda
        this.crmDeleteExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmDeleteExhibitionLambda", {
            functionName: `crm-${props.envName}-delete-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-delete.handler.ts"),
            environment: {
                EXHIBITION_TABLE_NAME: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmDeleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Update Exhibition lambda
        this.crmUpdateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmUpdateExhibitionLambda", {
            functionName: `crm-${props.envName}-update-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-update.handler.ts"),
            environment: {
                EXHIBITION_TABLE_NAME: props.crmStorage.crmExhibitionTable.tableName
            }
        });
        this.crmUpdateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.crmStorage.crmExhibitionTable.tableArn]
            })
        );

        // Create Exhibition Snapshot lambda
        this.crmCreateExhibitionSnapshotLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionSnapshotLambda", {
            functionName: `crm-${props.envName}-create-exhibition-snapshot-lambda`,
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-snapshot-create.handler.ts"),
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

        // Create Exhibition Step Function
        const createExhibitionLogGroup = new LogGroup(this, 'CrmCreateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.crmCreateExhibitionStateMachine = new step.StateMachine(this, 'CreateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitionLogGroup,
                level: step.LogLevel.ALL,
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


        // Update Exhibition Step Function
        const updateExhibitionLogGroup = new LogGroup(this, 'CrmUpdateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.crmUpdateExhibitionStateMachine = new step.StateMachine(this, 'UpdateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-update-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definition: new tasks.LambdaInvoke(this, "UpdateExhibition",
                {
                    lambdaFunction: this.crmUpdateExhibitionLambda,
                    outputPath: '$.Payload',
                }
            )
                .next(new step.Succeed(this, "Updated"))
        });

        // Delete Exhibition Step Function
        const deleteExhibitionLogGroup = new LogGroup(this, 'CrmDeleteExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const deleteSnapshotMap = new step.Map(this, 'DeleteExhibitionSnapshots', {
            maxConcurrency: 1,
            resultPath: step.JsonPath.DISCARD,
        });
        deleteSnapshotMap.iterator(new tasks.DynamoDeleteItem(this, "DeleteExhibitionSnapshot",
            {
                table: props.crmStorage.crmExhibitionSnapshotTable,
                key: {
                    "id": tasks.DynamoAttributeValue.fromString(step.JsonPath.stringAt("$.id")),
                    "lang": tasks.DynamoAttributeValue.fromString(step.JsonPath.stringAt("$.lang"))
                },
                outputPath: '$',
            }
        ))

        this.crmDeleteExhibitionStateMachine = new step.StateMachine(this, 'DeleteExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-delete-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: deleteExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definition: new tasks.LambdaInvoke(this, "DeleteExhibition",
                {
                    lambdaFunction: this.crmDeleteExhibitionLambda,
                    outputPath: '$.Payload',
                }
            )
                .next(deleteSnapshotMap)
                .next(new step.Succeed(this, "Deleted"))
        });
    }
}