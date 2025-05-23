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

export interface CreateExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly qrCodeGeneratorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}

export class CreateExhibitionConstruct extends Construct {

    public readonly createExhibitionLambda: lambdaNode.NodejsFunction
    public readonly createExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: CreateExhibitionConstructProps) {
        super(scope, id);

        // Create Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const createExhibitionLogGroup = new LogGroup(this, 'CreateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const createExhibitionGenerateQrCodeState = new tasks.LambdaInvoke(this, "CreateExhibitionGenerateQrCodeState",
            {
                lambdaFunction: props.qrCodeGeneratorLambda,
                inputPath: '$.asset.qrCode',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitionGenerateQrCodeState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitionProcessImagesState = new tasks.LambdaInvoke(this, "CreateExhibitionProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitionProcessImagesState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitionSkipProcessImagesState = new step.Pass(this, 'CreateExhibitionSkipProcessImagesState');
        const createExhibitionChoiceProcessImagesState = new step.Choice(this, 'CreateExhibitionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                createExhibitionProcessImagesState
            )
            .otherwise(createExhibitionSkipProcessImagesState)

        const createExhibitionProcessAudioState = new tasks.LambdaInvoke(this, "CreateExhibitionProcessAudioState",
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
            .addCatch(assetProcessingError(this, "CreateExhibitionProcessAudioState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitionSkipProcessAudioState = new step.Pass(this, 'CreateExhibitionSkipProcessAudioState');
        const createExhibitionChoiceProcessAudioState = new step.Choice(this, 'CreateExhibitionChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                createExhibitionProcessAudioState
            )
            .otherwise(createExhibitionSkipProcessAudioState)

        const setExhibitionCreated = new tasks.DynamoUpdateItem(this, 'SetExhibitionCreated', {
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

        const unlockSubscription = createUnlockSubscriptionParallelTask(this, 'CreateExhibition', props.storage.crmResourceTable)

        const invalidateCacheState = new tasks.LambdaInvoke(this, "CreateExhibitionInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/v1/institutions/{}/exhibitions*', step.JsonPath.stringAt('$[0].entity.institutionId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitionInvalidateCacheState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const parallelCreateExhibitionAsset = new step.Parallel(
            this,
            'ParallelCreateExhibitionAsset'
        );

        parallelCreateExhibitionAsset.branch(createExhibitionGenerateQrCodeState);
        parallelCreateExhibitionAsset.branch(createExhibitionChoiceProcessImagesState);
        parallelCreateExhibitionAsset.branch(createExhibitionChoiceProcessAudioState);

        const parallelCreateExhibitionSucceed = new step.Parallel(
            this,
            'ParallelCreateExhibitionSucceed'
        );

        parallelCreateExhibitionSucceed.branch(setExhibitionCreated)
        parallelCreateExhibitionSucceed.branch(unlockSubscription);

        this.createExhibitionStateMachine = new step.StateMachine(this, 'CreateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelCreateExhibitionAsset
                    .next(invalidateCacheState)
                    .next(parallelCreateExhibitionSucceed)
                    .next(new step.Succeed(this, "Created"))
            )
        });

        // Create Exhibition lambda
        this.createExhibitionLambda = new lambdaNode.NodejsFunction(this, "CreateExhibitionLambda", {
            functionName: `crm-${props.envName}-create-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionCreateHandler",
            timeout: cdk.Duration.seconds(30),
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                CREATE_EXHIBITION_STEP_FUNCTION_ARN: this.createExhibitionStateMachine.stateMachineArn,
            }
        });
        this.createExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.createExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.createExhibitionStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}