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

export interface DeleteExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}

export class DeleteExhibitionConstruct extends Construct {

    public readonly deleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly deleteExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: DeleteExhibitionConstructProps) {
        super(scope, id);

        const assetProcessingError = (id: string, status: string) => {
            return new tasks.DynamoUpdateItem(this, `ProcessingError-${id}`, {
                key: {
                    pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$.entityId'))),
                    sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$exhibition_1#id_{}', step.JsonPath.stringAt('$.entityId'))),
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
                .next(new step.Fail(this, `DeleteExhibitionFail-${id}`))
        }

        // Delete Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const deleteExhibitionLogGroup = new LogGroup(this, 'DeleteExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const deleteExhibitionDeleteAssetState = new tasks.LambdaInvoke(this, "DeleteExhibitionDeleteAssetState",
            {
                lambdaFunction: props.deleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("DeleteExhibitionDeleteAssetState", "ERROR"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const invalidateCacheState = new tasks.LambdaInvoke(this, "UpdateExhibitionInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/exhibitions/{}/*', step.JsonPath.stringAt('$.entityId')),
                        step.JsonPath.format('/v1/exhibitions/{}*', step.JsonPath.stringAt('$.entityId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateExhibitionInvalidateCacheState", "ERROR"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        this.deleteExhibitionStateMachine = new step.StateMachine(this, 'DeleteExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-delete-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: deleteExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                deleteExhibitionDeleteAssetState
                    .next(invalidateCacheState)
                    .next(new step.Succeed(this, "Deleted"))
            )
        });

        // Delete Exhibition lambda
        this.deleteExhibitionLambda = new lambdaNode.NodejsFunction(this, "DeleteExhibitionLambda", {
            functionName: `crm-${props.envName}-delete-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionDeleteHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                DELETE_EXHIBITION_STEP_FUNCTION_ARN: this.deleteExhibitionStateMachine.stateMachineArn,
            }
        });
        this.deleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.deleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.deleteExhibitionStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}