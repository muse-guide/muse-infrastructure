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

export interface MuseCrmCreateExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly errorHandlerLambda: lambdaNode.NodejsFunction,
    readonly crmImageProcessorLambda: lambdaNode.NodejsFunction,
    readonly crmQrCodeGeneratorLambda: lambdaNode.NodejsFunction
}

export class MuseCrmCreateExhibitionConstruct extends Construct {

    public readonly crmCreateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmCreateExhibitionConstructProps) {
        super(scope, id);

        // Create Exhibition lambda
        this.crmCreateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionLambda", {
            functionName: `crm-${props.envName}-create-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionCreateHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
            }
        });
        this.crmCreateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );
        this.crmCreateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
            })
        )

        // Create Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const createExhibitionLogGroup = new LogGroup(this, 'CrmCreateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const createExhibitionPassMutationState = new step.Pass(this, 'CreateExhibitionPassMutationState');

        const createExhibitionGenerateQrCodeState = new tasks.LambdaInvoke(this, "CreateExhibitionGenerateQrCodeState",
            {
                lambdaFunction: props.crmQrCodeGeneratorLambda,
                inputPath: '$.asset.qrCode',
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)

        const createExhibitionProcessImagesState = new tasks.LambdaInvoke(this, "CreateExhibitionProcessImagesState",
            {
                lambdaFunction: props.crmImageProcessorLambda,
                inputPath: '$.asset.images',
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)

        const createExhibitionSkipProcessImagesState = new step.Pass(this, 'CreateExhibitionSkipProcessImagesState');
        const createExhibitionChoiceProcessImagesState = new step.Choice(this, 'CreateExhibitionChoiceProcessImagesState')
            .when(
                step.Condition.isPresent('$.asset.images'),
                createExhibitionProcessImagesState
            )
            .otherwise(createExhibitionSkipProcessImagesState)

        const createExhibitionState = new tasks.LambdaInvoke(this, "CreateExhibition",
            {
                lambdaFunction: this.crmCreateExhibitionLambda,
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)
            .addCatch(new tasks.LambdaInvoke(this, "CreateExhibitionErrorHandler",
                {
                    lambdaFunction: props.errorHandlerLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(retryPolicy)
                .next(new step.Fail(this, "CreateExhibitionFail",
                        {
                            errorPath: step.JsonPath.stringAt('$.error'),
                            causePath: step.JsonPath.stringAt('$.cause'),
                        }
                    )
                )
            )

        const parallelCreateExhibition = new step.Parallel(
            this,
            'ParallelCreateExhibition'
        );

        parallelCreateExhibition.branch(createExhibitionPassMutationState);
        parallelCreateExhibition.branch(createExhibitionGenerateQrCodeState);
        parallelCreateExhibition.branch(createExhibitionChoiceProcessImagesState);

        this.crmCreateExhibitionStateMachine = new step.StateMachine(this, 'CreateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                createExhibitionState
                    .next(parallelCreateExhibition)
                    .next(new step.Succeed(this, "Created", {
                        outputPath: '$[0].entityId',
                    }))
            )
        });
    }
}