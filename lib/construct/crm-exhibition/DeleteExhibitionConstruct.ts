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
import {assetProcessingError} from "../../common/CommonResources";

export interface DeleteExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly deleteAssetLambda: lambdaNode.NodejsFunction,
    readonly cdnManagerLambda: lambdaNode.NodejsFunction,
    readonly deleteExhibitStateMachine: step.StateMachine,
}

export class DeleteExhibitionConstruct extends Construct {

    public readonly deleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly deleteExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: DeleteExhibitionConstructProps) {
        super(scope, id);

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
            .addCatch(assetProcessingError(this, "DeleteExhibitionDeleteAssetState", props.storage.crmResourceTable, 'exhibition'), {
                errors: ['States.ALL'],
                resultPath: '$.errorInfo',
            })

        const invalidateCacheState = new tasks.LambdaInvoke(this, "UpdateExhibitionInvalidateCacheState",
            {
                lambdaFunction: props.cdnManagerLambda,
                payload: step.TaskInput.fromObject({
                    paths: step.JsonPath.array(
                        step.JsonPath.format('/asset/{}/*', step.JsonPath.stringAt('$.entityId')),
                        step.JsonPath.format('/v1/exhibitions/{}*', step.JsonPath.stringAt('$.entityId')),
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
                DELETE_EXHIBIT_STEP_FUNCTION_ARN: props.deleteExhibitStateMachine.stateMachineArn,
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
        this.deleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [props.deleteExhibitStateMachine.stateMachineArn],
                actions: ["states:StartExecution"],
                effect: Effect.ALLOW
            })
        )
    }
}