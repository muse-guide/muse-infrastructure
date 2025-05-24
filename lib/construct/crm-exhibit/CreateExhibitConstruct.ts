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

export interface CreateExhibitConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly qrCodeGeneratorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}

export class CreateExhibitConstruct extends Construct {

    public readonly createExhibitLambda: lambdaNode.NodejsFunction
    public readonly createExhibitStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: CreateExhibitConstructProps) {
        super(scope, id);


        // Create Exhibit Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const createExhibitLogGroup = new LogGroup(this, 'CreateExhibitLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const createExhibitGenerateQrCodeState = new tasks.LambdaInvoke(this, "CreateExhibitGenerateQrCodeState",
            {
                lambdaFunction: props.qrCodeGeneratorLambda,
                inputPath: '$.asset.qrCode',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitGenerateQrCodeState", props.storage.crmResourceTable, 'exhibit'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitProcessImagesState = new tasks.LambdaInvoke(this, "CreateExhibitProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitProcessImagesState", props.storage.crmResourceTable, 'exhibit'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitSkipProcessImagesState = new step.Pass(this, 'CreateExhibitSkipProcessImagesState');
        const createExhibitChoiceProcessImagesState = new step.Choice(this, 'CreateExhibitChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                createExhibitProcessImagesState
            )
            .otherwise(createExhibitSkipProcessImagesState)

        const createExhibitProcessAudioState = new tasks.LambdaInvoke(this, "CreateExhibitProcessAudioState",
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
            .addCatch(assetProcessingError(this, "CreateExhibitProcessAudioState", props.storage.crmResourceTable, 'exhibit'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitSkipProcessAudioState = new step.Pass(this, 'CreateExhibitSkipProcessAudioState');
        const createExhibitChoiceProcessAudioState = new step.Choice(this, 'CreateExhibitChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                createExhibitProcessAudioState
            )
            .otherwise(createExhibitSkipProcessAudioState)

        const setExhibitCreated = new tasks.DynamoUpdateItem(this, 'SetExhibitCreated', {
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

        const invalidateCacheState = new tasks.LambdaInvoke(this, "CreateExhibitInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/v1/exhibitions/{}/exhibits*', step.JsonPath.stringAt('$[0].entity.exhibitionId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateExhibitInvalidateCacheState", props.storage.crmResourceTable, 'exhibit'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const unlockSubscription = createUnlockSubscriptionParallelTask(this, 'CreateExhibitUnlockSubscription', props.storage.crmResourceTable)

        const parallelCreateExhibit = new step.Parallel(
            this,
            'ParallelCreateExhibit'
        );

        parallelCreateExhibit.branch(createExhibitGenerateQrCodeState);
        parallelCreateExhibit.branch(createExhibitChoiceProcessImagesState);
        parallelCreateExhibit.branch(createExhibitChoiceProcessAudioState);

        const parallelCreateExhibitSucceed = new step.Parallel(
            this,
            'ParallelCreateExhibitSucceed'
        );

        parallelCreateExhibitSucceed.branch(setExhibitCreated)
        parallelCreateExhibitSucceed.branch(unlockSubscription);

        this.createExhibitStateMachine = new step.StateMachine(this, 'CreateExhibitStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibit-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelCreateExhibit
                    .next(invalidateCacheState)
                    .next(parallelCreateExhibitSucceed)
                    .next(new step.Succeed(this, "Created"))
            )
        });

        // Create Exhibit lambda
        this.createExhibitLambda = new lambdaNode.NodejsFunction(this, "CreateExhibitLambda", {
            functionName: `crm-${props.envName}-create-exhibit-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibit-handler.ts"),
            handler: "exhibitCreateHandler",
            timeout: cdk.Duration.seconds(30),
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                CREATE_EXHIBIT_STEP_FUNCTION_ARN: this.createExhibitStateMachine.stateMachineArn,
            }
        });
        this.createExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.createExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.createExhibitStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}