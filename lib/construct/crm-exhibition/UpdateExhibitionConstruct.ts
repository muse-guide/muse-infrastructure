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
import {assetProcessingError, createUnlockSubscriptionParallelTask} from "../../common/CommonResources";

export interface UpdateExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}
export class UpdateExhibitionConstruct extends Construct {

    public readonly updateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly updateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: UpdateExhibitionConstructProps) {
        super(scope, id);

        // Update Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const updateExhibitionLogGroup = new LogGroup(this, 'UpdateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const updateExhibitionProcessImagesState = new tasks.LambdaInvoke(this, "UpdateExhibitionProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "UpdateExhibitionProcessImagesState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitionSkipProcessImagesState = new step.Pass(this, 'UpdateExhibitionSkipProcessImagesState');
        const updateExhibitionChoiceProcessImagesState = new step.Choice(this, 'UpdateExhibitionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                updateExhibitionProcessImagesState
            )
            .otherwise(updateExhibitionSkipProcessImagesState)

        const updateExhibitionProcessAudioState = new tasks.LambdaInvoke(this, "UpdateExhibitionProcessAudioState",
            {
                lambdaFunction: props.audioProcessorLambda,
                payload: step.TaskInput.fromObject({
                    actor: step.JsonPath.objectAt('$.actor'),
                    audios: step.JsonPath.objectAt('$.asset.audios'),
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "UpdateExhibitionProcessAudioState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitionSkipProcessAudioState = new step.Pass(this, 'UpdateExhibitionSkipProcessAudioState');
        const updateExhibitionChoiceProcessAudioState = new step.Choice(this, 'UpdateExhibitionChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                updateExhibitionProcessAudioState
            )
            .otherwise(updateExhibitionSkipProcessAudioState)

        const updateExhibitionDeleteAssetState = new tasks.LambdaInvoke(this, "UpdateExhibitionDeleteAssetState",
            {
                lambdaFunction: props.deleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "UpdateExhibitionDeleteAssetState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateExhibitionSkipDeleteAssetState = new step.Pass(this, 'UpdateExhibitionSkipDeleteAssetState');
        const updateExhibitionChoiceDeleteAssetState = new step.Choice(this, 'UpdateExhibitionChoiceDeleteAssetState')
            .when(
                step.Condition.isPresent('$.asset.delete'),
                updateExhibitionDeleteAssetState
            )
            .otherwise(updateExhibitionSkipDeleteAssetState)

        const setExhibitionUpdated = new tasks.DynamoUpdateItem(this, 'SetExhibitionUpdated', {
            key: {
                pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
                sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$exhibition_1#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
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

        const unlockSubscription = createUnlockSubscriptionParallelTask(this, 'UpdateExhibition', props.storage.crmResourceTable)

        const invalidateCacheState = new tasks.LambdaInvoke(this, "UpdateExhibitionInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/{}/*', step.JsonPath.stringAt('$[0].entityId')),
                        step.JsonPath.format('/v1/exhibitions/{}*', step.JsonPath.stringAt('$[0].entityId')),
                        step.JsonPath.format('/v1/institutions/{}/exhibitions*', step.JsonPath.stringAt('$[0].entity.institutionId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "UpdateExhibitionInvalidateCacheState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const parallelUpdateExhibitionAsset = new step.Parallel(
            this,
            'ParallelUpdateExhibitionAsset'
        );

        parallelUpdateExhibitionAsset.branch(updateExhibitionChoiceProcessImagesState);
        parallelUpdateExhibitionAsset.branch(updateExhibitionChoiceProcessAudioState);
        parallelUpdateExhibitionAsset.branch(updateExhibitionChoiceDeleteAssetState);

        const parallelUpdateExhibitionSucceed = new step.Parallel(
            this,
            'ParallelUpdateExhibitionSucceed'
        );

        parallelUpdateExhibitionSucceed.branch(setExhibitionUpdated)
        parallelUpdateExhibitionSucceed.branch(unlockSubscription);

        this.updateExhibitionStateMachine = new step.StateMachine(this, 'UpdateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-update-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelUpdateExhibitionAsset
                    .next(invalidateCacheState)
                    .next(parallelUpdateExhibitionSucceed)
                    .next(new step.Succeed(this, "Updated"))
            )
        });

        // Update Exhibition lambda
        this.updateExhibitionLambda = new lambdaNode.NodejsFunction(this, "UpdateExhibitionLambda", {
            functionName: `crm-${props.envName}-update-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionUpdateHandler",
            timeout: cdk.Duration.seconds(30),
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                UPDATE_EXHIBITION_STEP_FUNCTION_ARN: this.updateExhibitionStateMachine.stateMachineArn,
            }
        });
        this.updateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.updateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.updateExhibitionStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}