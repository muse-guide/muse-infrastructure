import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {Duration, RemovalPolicy} from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {MuseCrmStorageConstruct} from "../muse-crm-storage-construct";

export interface MuseCrmUpdateExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly errorHandlerLambda: lambdaNode.NodejsFunction,
    readonly crmImageProcessorLambda: lambdaNode.NodejsFunction
    readonly crmDeleteAssetLambda: lambdaNode.NodejsFunction
}

export class MuseCrmUpdateExhibitionConstruct extends Construct {

    public readonly crmUpdateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmUpdateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmUpdateExhibitionConstructProps) {
        super(scope, id);

        // Update Exhibition lambda
        this.crmUpdateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmUpdateExhibitionLambda", {
            functionName: `crm-${props.envName}-update-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionUpdateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
            }
        });
        this.crmUpdateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );

        // Update Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const updateExhibitionLogGroup = new LogGroup(this, 'CrmUpdateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const updateExhibitionPassMutationState = new step.Pass(this, 'UpdateExhibitionPassMutationState');

        const updateExhibitionProcessImagesState = new tasks.LambdaInvoke(this, "UpdateExhibitionProcessImagesState",
            {
                lambdaFunction: props.crmImageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)

        const updateExhibitionSkipProcessImagesState = new step.Pass(this, 'UpdateExhibitionSkipProcessImagesState');
        const updateExhibitionChoiceProcessImagesState = new step.Choice(this, 'UpdateExhibitionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                updateExhibitionProcessImagesState
            )
            .otherwise(updateExhibitionSkipProcessImagesState)

        const updateExhibitionDeleteAssetState = new tasks.LambdaInvoke(this, "UpdateExhibitionDeleteAssetState",
            {
                lambdaFunction: props.crmDeleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)

        const updateExhibitionSkipDeleteAssetState = new step.Pass(this, 'UpdateExhibitionSkipDeleteAssetState');
        const updateExhibitionChoiceDeleteAssetState = new step.Choice(this, 'UpdateExhibitionChoiceDeleteAssetState')
            .when(
                step.Condition.or(
                    step.Condition.isPresent('$.asset.delete.private'),
                    step.Condition.isPresent('$.asset.delete.public')
                ),
                updateExhibitionDeleteAssetState
            )
            .otherwise(updateExhibitionSkipDeleteAssetState)

        const updateExhibitionState = new tasks.LambdaInvoke(this, "UpdateExhibition",
            {
                lambdaFunction: this.crmUpdateExhibitionLambda,
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)
            .addCatch(new tasks.LambdaInvoke(this, "UpdateExhibitionErrorHandler",
                {
                    lambdaFunction: props.errorHandlerLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(retryPolicy)
                .next(new step.Fail(this, "UpdateExhibitionFail",
                        {
                            errorPath: step.JsonPath.stringAt('$.error'),
                            causePath: step.JsonPath.stringAt('$.cause'),
                        }
                    )
                )
            )

        const parallelUpdateExhibition = new step.Parallel(
            this,
            'ParallelUpdateExhibition'
        );

        parallelUpdateExhibition.branch(updateExhibitionPassMutationState);
        parallelUpdateExhibition.branch(updateExhibitionChoiceDeleteAssetState);
        parallelUpdateExhibition.branch(updateExhibitionChoiceProcessImagesState);

        this.crmUpdateExhibitionStateMachine = new step.StateMachine(this, 'UpdateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-update-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                updateExhibitionState
                    .next(parallelUpdateExhibition)
                    .next(new step.Succeed(this, "Updated", {
                        outputPath: '$[0].entityId',
                    }))
            )
        });
    }
}