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

export interface CreateExhibitConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly errorHandlerLambda: lambdaNode.NodejsFunction,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly qrCodeGeneratorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
}

export class CreateExhibitConstruct extends Construct {

    public readonly createExhibitLambda: lambdaNode.NodejsFunction
    public readonly createExhibitStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: CreateExhibitConstructProps) {
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
                .next(new step.Fail(this, `CreateExhibitFail-${id}`))
        }

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

        const createExhibitPassMutationState = new step.Pass(this, 'CreateExhibitPassMutationState');

        const createExhibitGenerateQrCodeState = new tasks.LambdaInvoke(this, "CreateExhibitGenerateQrCodeState",
            {
                lambdaFunction: props.qrCodeGeneratorLambda,
                inputPath: '$.asset.qrCode',
                outputPath: '$.entityId',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("CreateExhibitGenerateQrCodeState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const createExhibitProcessImagesState = new tasks.LambdaInvoke(this, "CreateExhibitProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$.entityId',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("CreateExhibitProcessImagesState"), {
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
                inputPath: '$.asset.audios',
                outputPath: '$.entityId',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("CreateExhibitProcessAudioState"), {
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

        const parallelCreateExhibit = new step.Parallel(
            this,
            'ParallelCreateExhibit'
        );

        parallelCreateExhibit.branch(createExhibitPassMutationState);
        parallelCreateExhibit.branch(createExhibitGenerateQrCodeState);
        parallelCreateExhibit.branch(createExhibitChoiceProcessImagesState);
        parallelCreateExhibit.branch(createExhibitChoiceProcessAudioState);

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
                    .next(setExhibitCreated)
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
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CREATE_EXHIBIT_STEP_FUNCTION_ARN: this.createExhibitStateMachine.stateMachineArn,
            }
        });
        this.createExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );
        this.createExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
            })
        )
        this.createExhibitLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.createExhibitStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}