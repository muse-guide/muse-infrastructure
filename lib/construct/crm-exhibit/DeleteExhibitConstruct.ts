import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {Duration, RemovalPolicy} from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import {Effect} from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";

export interface DeleteExhibitConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}

export class DeleteExhibitConstruct extends Construct {

    public readonly deleteExhibitLambda: lambdaNode.NodejsFunction
    public readonly deleteExhibitStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: DeleteExhibitConstructProps) {
        super(scope, id);

        const assetProcessingError = (id: string, status: string) => {
            return new tasks.DynamoUpdateItem(this, `ProcessingError-${id}`, {
                key: {
                    pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$.entityId'))),
                    sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$exhibit_1#id_{}', step.JsonPath.stringAt('$.entityId'))),
                },
                expressionAttributeNames: {
                    '#S': "status"
                },
                expressionAttributeValues: {
                    ':val': tasks.DynamoAttributeValue.fromString(status)
                },
                table: props.storage.crmResourceTable,
                updateExpression: 'SET #S=:val',
                outputPath: '$.entityId',
                resultPath: step.JsonPath.DISCARD
            })
                .addRetry(retryPolicy)
                .next(new step.Fail(this, `DeleteExhibitFail-${id}`))
        }

        // Delete Exhibit Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const deleteExhibitLogGroup = new LogGroup(this, 'DeleteExhibitLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const deleteExhibitDeleteAssetState = new tasks.LambdaInvoke(this, "DeleteExhibitDeleteAssetState",
            {
                lambdaFunction: props.deleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("DeleteExhibitDeleteAssetState", "ERROR"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const invalidateCacheState = new tasks.LambdaInvoke(this, "DeleteExhibitInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/exhibits/{}/*', step.JsonPath.stringAt('$.entityId')),
                        step.JsonPath.format('/v1/exhibits/{}*', step.JsonPath.stringAt('$.entityId')),
                        step.JsonPath.format('/v1/exhibitions/{}/exhibits*', step.JsonPath.stringAt('$.entity.exhibitionId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("DeleteExhibitInvalidateCacheState", "ERROR"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        this.deleteExhibitStateMachine = new step.StateMachine(this, 'DeleteExhibitStateMachine', {
            stateMachineName: `crm-${props.envName}-delete-exhibit-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: deleteExhibitLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                deleteExhibitDeleteAssetState
                    .next(invalidateCacheState)
                    .next(new step.Succeed(this, "Deleted"))
            )
        });

        // Delete Exhibit lambda
        this.deleteExhibitLambda = new lambdaNode.NodejsFunction(this, "DeleteExhibitLambda", {
            functionName: `crm-${props.envName}-delete-exhibit-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-handler.ts"),
            handler: "exhibitDeleteHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                DELETE_EXHIBIT_STEP_FUNCTION_ARN: this.deleteExhibitStateMachine.stateMachineArn,
            }
        });
        this.deleteExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.deleteExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.deleteExhibitStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}