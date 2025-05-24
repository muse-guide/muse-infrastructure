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

export interface CreateInstitutionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly qrCodeGeneratorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
}

export class CreateInstitutionConstruct extends Construct {

    public readonly createInstitutionLambda: lambdaNode.NodejsFunction
    public readonly createInstitutionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: CreateInstitutionConstructProps) {
        super(scope, id);

        // Create Institution Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const createInstitutionLogGroup = new LogGroup(this, 'CreateInstitutionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const createInstitutionGenerateQrCodeState = new tasks.LambdaInvoke(this, "CreateInstitutionGenerateQrCodeState",
            {
                lambdaFunction: props.qrCodeGeneratorLambda,
                inputPath: '$.asset.qrCode',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateInstitutionGenerateQrCodeState", props.storage.crmResourceTable, 'institution'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createInstitutionProcessImagesState = new tasks.LambdaInvoke(this, "CreateInstitutionProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError(this, "CreateInstitutionProcessImagesState", props.storage.crmResourceTable, 'institution'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createInstitutionSkipProcessImagesState = new step.Pass(this, 'CreateInstitutionSkipProcessImagesState');
        const createInstitutionChoiceProcessImagesState = new step.Choice(this, 'CreateInstitutionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                createInstitutionProcessImagesState
            )
            .otherwise(createInstitutionSkipProcessImagesState)

        const createInstitutionProcessAudioState = new tasks.LambdaInvoke(this, "CreateInstitutionProcessAudioState",
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
            .addCatch(assetProcessingError(this, "CreateInstitutionProcessAudioState", props.storage.crmResourceTable, 'institution'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createInstitutionSkipProcessAudioState = new step.Pass(this, 'CreateInstitutionSkipProcessAudioState');
        const createInstitutionChoiceProcessAudioState = new step.Choice(this, 'CreateInstitutionChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                createInstitutionProcessAudioState
            )
            .otherwise(createInstitutionSkipProcessAudioState)

        const setInstitutionCreated = new tasks.DynamoUpdateItem(this, 'SetInstitutionCreated', {
            key: {
                pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
                sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$institution_1#id_{}', step.JsonPath.stringAt('$[0].entityId'))),
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

        const unlockSubscription = createUnlockSubscriptionParallelTask(this, 'CreateInstitution', props.storage.crmResourceTable)

        const parallelCreateInstitution = new step.Parallel(
            this,
            'ParallelCreateInstitution'
        );

        parallelCreateInstitution.branch(createInstitutionGenerateQrCodeState);
        parallelCreateInstitution.branch(createInstitutionChoiceProcessImagesState);
        parallelCreateInstitution.branch(createInstitutionChoiceProcessAudioState);

        const parallelCreateInstitutionSucceed = new step.Parallel(
            this,
            'ParallelCreateInstitutionSucceed'
        );

        parallelCreateInstitutionSucceed.branch(setInstitutionCreated)
        parallelCreateInstitutionSucceed.branch(unlockSubscription);

        this.createInstitutionStateMachine = new step.StateMachine(this, 'CreateInstitutionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-institution-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createInstitutionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelCreateInstitution
                    .next(parallelCreateInstitutionSucceed)
                    .next(new step.Succeed(this, "Created"))
            )
        });

        // Create Institution lambda
        this.createInstitutionLambda = new lambdaNode.NodejsFunction(this, "CreateInstitutionLambda", {
            functionName: `crm-${props.envName}-create-institution-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/institution-handler.ts"),
            handler: "institutionCreateHandler",
            timeout: cdk.Duration.seconds(30),
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                CREATE_INSTITUTION_STEP_FUNCTION_ARN: this.createInstitutionStateMachine.stateMachineArn,
            }
        });
        this.createInstitutionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.createInstitutionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.createInstitutionStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}