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

export interface UpdateInstitutionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly imageProcessorLambda: lambdaNode.NodejsFunction,
    readonly audioProcessorLambda: lambdaNode.NodejsFunction,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
}
export class UpdateInstitutionConstruct extends Construct {

    public readonly updateInstitutionLambda: lambdaNode.NodejsFunction
    public readonly updateInstitutionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: UpdateInstitutionConstructProps) {
        super(scope, id);

        const assetProcessingError = (id: string) => {
            return new tasks.DynamoUpdateItem(this, `ProcessingError-${id}`, {
                key: {
                    pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$.entityId'))),
                    sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$institution_1#id_{}', step.JsonPath.stringAt('$.entityId'))),
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
                .next(new step.Fail(this, `UpdateInstitutionFail-${id}`))
        }

        // Update Institution Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const updateInstitutionLogGroup = new LogGroup(this, 'UpdateInstitutionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const updateInstitutionProcessImagesState = new tasks.LambdaInvoke(this, "UpdateInstitutionProcessImagesState",
            {
                lambdaFunction: props.imageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateInstitutionProcessImagesState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateInstitutionSkipProcessImagesState = new step.Pass(this, 'UpdateInstitutionSkipProcessImagesState');
        const updateInstitutionChoiceProcessImagesState = new step.Choice(this, 'UpdateInstitutionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                updateInstitutionProcessImagesState
            )
            .otherwise(updateInstitutionSkipProcessImagesState)

        const updateInstitutionProcessAudioState = new tasks.LambdaInvoke(this, "UpdateInstitutionProcessAudioState",
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
            .addCatch(assetProcessingError("UpdateInstitutionProcessAudioState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateInstitutionSkipProcessAudioState = new step.Pass(this, 'UpdateInstitutionSkipProcessAudioState');
        const updateInstitutionChoiceProcessAudioState = new step.Choice(this, 'UpdateInstitutionChoiceProcessAudioState')
            .when(
                step.Condition.isPresent('$.asset.audios'),
                updateInstitutionProcessAudioState
            )
            .otherwise(updateInstitutionSkipProcessAudioState)

        const updateInstitutionDeleteAssetState = new tasks.LambdaInvoke(this, "UpdateInstitutionDeleteAssetState",
            {
                lambdaFunction: props.deleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateInstitutionDeleteAssetState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const updateInstitutionSkipDeleteAssetState = new step.Pass(this, 'UpdateInstitutionSkipDeleteAssetState');
        const updateInstitutionChoiceDeleteAssetState = new step.Choice(this, 'UpdateInstitutionChoiceDeleteAssetState')
            .when(
                step.Condition.isPresent('$.asset.delete'),
                updateInstitutionDeleteAssetState
            )
            .otherwise(updateInstitutionSkipDeleteAssetState)

        const setInstitutionUpdated = new tasks.DynamoUpdateItem(this, 'SetInstitutionUpdated', {
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

        const parallelUpdateInstitution = new step.Parallel(
            this,
            'ParallelUpdateInstitution'
        );

        const invalidateCacheState = new tasks.LambdaInvoke(this, "UpdateInstitutionInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/{}/*', step.JsonPath.stringAt('$[0].entityId')),
                        step.JsonPath.format('/v1/institutions/{}*', step.JsonPath.stringAt('$[0].entityId')),
                    )
                }),
                outputPath: '$',
                resultPath: step.JsonPath.DISCARD
            })
            .addRetry(retryPolicy)
            .addCatch(assetProcessingError("UpdateInstitutionInvalidateCacheState"), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        parallelUpdateInstitution.branch(updateInstitutionChoiceProcessImagesState);
        parallelUpdateInstitution.branch(updateInstitutionChoiceProcessAudioState);
        parallelUpdateInstitution.branch(updateInstitutionChoiceDeleteAssetState);

        this.updateInstitutionStateMachine = new step.StateMachine(this, 'UpdateInstitutionStateMachine', {
            stateMachineName: `crm-${props.envName}-update-institution-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateInstitutionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                parallelUpdateInstitution
                    .next(invalidateCacheState)
                    .next(setInstitutionUpdated)
                    .next(new step.Succeed(this, "Updated"))
            )
        });

        // Update Institution lambda
        this.updateInstitutionLambda = new lambdaNode.NodejsFunction(this, "UpdateInstitutionLambda", {
            functionName: `crm-${props.envName}-update-institution-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/institution-handler.ts"),
            handler: "institutionUpdateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                UPDATE_INSTITUTION_STEP_FUNCTION_ARN: this.updateInstitutionStateMachine.stateMachineArn,
            }
        });
        this.updateInstitutionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmResourceTable.tableArn,
                    `${props.storage.crmResourceTable.tableArn}/index/*`
                ]
            })
        );
        this.updateInstitutionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [this.updateInstitutionStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}