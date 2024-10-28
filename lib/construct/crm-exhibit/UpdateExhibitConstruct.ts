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

export interface UpdateExhibitConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}

export class UpdateExhibitConstruct extends Construct {

    public readonly updateExhibitLambda: lambdaNode.NodejsFunction
    public readonly updateExhibitStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: UpdateExhibitConstructProps) {
        super(scope, id);

        const assetProcessingError = (id: string) => {
            return new tasks.DynamoUpdateItem(this, `ProcessingError-${id}`, {
                key: {
                    pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$.entityId'))),
                    sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$exhibit_1#id_{}', step.JsonPath.stringAt('$.entityId'))),
                },
                expressionAttributeNames: {
                    '#S': "status"
                },
                expressionAttributeValues: {
                    ':val': tasks.DynamoAttributeValue.fromString("ERROR")
                },
                table: props.storage.crmResourceTable,
                updateExpression: 'SET #S=:val',
                outputPath: '$.entityId',
                resultPath: step.JsonPath.DISCARD
            })
                .addRetry(retryPolicy)
                .next(new step.Fail(this, `UpdateExhibitFail-${id}`))
        }

        // Update Exhibit Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const updateExhibitLogGroup = new LogGroup(this, 'UpdateExhibitLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const updateExhibitProcessImagesState = new tasks.LambdaInvoke(this, "UpdateExhibitProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateExhibitProcessImagesState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitSkipProcessImagesState = new step.Pass(this, 'UpdateExhibitSkipProcessImagesState');
        const updateExhibitChoiceProcessImagesState = new step.Choice(this, 'UpdateExhibitChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                updateExhibitProcessImagesState
            )
            .otherwise(updateExhibitSkipProcessImagesState)

        const updateExhibitProcessAudioState = new tasks.LambdaInvoke(this, "UpdateExhibitProcessAudioState",
            {
                lambdaFunction: props.audioProcessorLambda,
                inputPath: '$.asset.audios',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateExhibitProcessAudioState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitSkipProcessAudioState = new step.Pass(this, 'UpdateExhibitSkipProcessAudioState');
        const updateExhibitChoiceProcessAudioState = new step.Choice(this, 'UpdateExhibitChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                updateExhibitProcessAudioState
            )
            .otherwise(updateExhibitSkipProcessAudioState)

        const updateExhibitDeleteAssetState = new tasks.LambdaInvoke(this, "UpdateExhibitDeleteAssetState",
            {
                lambdaFunction: props.deleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateExhibitDeleteAssetState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitSkipDeleteAssetState = new step.Pass(this, 'UpdateExhibitSkipDeleteAssetState');
        const updateExhibitChoiceDeleteAssetState = new step.Choice(this, 'UpdateExhibitChoiceDeleteAssetState')
            .when(
                step.Condition.isPresent('$.asset.delete'),
                updateExhibitDeleteAssetState
            )
            .otherwise(updateExhibitSkipDeleteAssetState)

        const setExhibitUpdated = new tasks.DynamoUpdateItem(this, 'SetExhibitUpdated', {
            key: {
                pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
                sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$exhibit_1#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
            },
            expressionAttributeNames: {
                '#S': "status"
            },
            expressionAttributeValues: {
                ':val': tasks.DynamoAttributeValue.fromString("ACTIVE")
            },
            table: props.storage.crmResourceTable,
            updateExpression: 'SET #S=:val',
            outputPath: '$[0].entityId',
            resultPath: step.JsonPath.DISCARD
        });

        const parallelUpdateExhibit = new step.Parallel(
            this,
            'ParallelUpdateExhibit'
        );

        const invalidateCacheState = new tasks.LambdaInvoke(this, "UpdateExhibitInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/exhibit/{}/*', step.JsonPath.stringAt('$[0].entityId')),
                        step.JsonPath.format('/v1/exhibits/{}*', step.JsonPath.stringAt('$[0].entityId')),
                        step.JsonPath.format('/v1/exhibitions/{}/exhibits*', step.JsonPath.stringAt('$[0].entity.exhibitionId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateExhibitInvalidateCacheState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        parallelUpdateExhibit.branch(updateExhibitChoiceProcessImagesState);
        parallelUpdateExhibit.branch(updateExhibitChoiceProcessAudioState);
        parallelUpdateExhibit.branch(updateExhibitChoiceDeleteAssetState);

        this.updateExhibitStateMachine = new step.StateMachine(this, 'UpdateExhibitStateMachine', {
            stateMachineName: `crm-${props.envName}-update-exhibit-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateExhibitLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelUpdateExhibit
                    .next(invalidateCacheState)
                    .next(setExhibitUpdated)
                    .next(new step.Succeed(this, "Updated"))
            )
        });

        // Update Exhibit lambda
        this.updateExhibitLambda = new lambdaNode.NodejsFunction(this, "UpdateExhibitLambda", {
            functionName: `crm-${props.envName}-update-exhibit-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-handler.ts"),
            handler: "exhibitUpdateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                UPDATE_EXHIBIT_STEP_FUNCTION_ARN: this.updateExhibitStateMachine.stateMachineArn,
            }
        });
        this.updateExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.updateExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.updateExhibitStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}