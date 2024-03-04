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

export interface MuseCrmDeleteExhibitionConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct,
    readonly errorHandlerLambda: lambdaNode.NodejsFunction,
    readonly crmDeleteAssetLambda: lambdaNode.NodejsFunction
}

export class MuseCrmDeleteExhibitionConstruct extends Construct {

    public readonly crmDeleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmDeleteExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmDeleteExhibitionConstructProps) {
        super(scope, id);

        // Delete Exhibition lambda
        this.crmDeleteExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmDeleteExhibitionLambda", {
            functionName: `crm-${props.envName}-delete-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionDeleteHandler",
            environment: {
                RESOURCE_TABLE_NAME: props.storage.crmResourceTable.tableName,
            }
        });
        this.crmDeleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmResourceTable.tableArn]
            })
        );

        // Delete Exhibition Step Function
        const retryPolicy: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        const deleteExhibitionLogGroup = new LogGroup(this, 'CrmDeleteExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const deleteExhibitionState = new tasks.LambdaInvoke(this, "DeleteExhibition",
            {
                lambdaFunction: this.crmDeleteExhibitionLambda,
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)
            .addCatch(new tasks.LambdaInvoke(this, "DeleteExhibitionErrorHandler",
                {
                    lambdaFunction: props.errorHandlerLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(retryPolicy)
                .next(new step.Fail(this, "DeleteExhibitionFail",
                        {
                            errorPath: step.JsonPath.stringAt('$.error'),
                            causePath: step.JsonPath.stringAt('$.cause'),
                        }
                    )
                )
            )

        const deleteExhibitionDeleteAssetState = new tasks.LambdaInvoke(this, "DeleteExhibitionDeleteAssetState",
            {
                lambdaFunction: props.crmDeleteAssetLambda,
                inputPath: '$.asset.delete',
                outputPath: '$.Payload',
            })
            .addRetry(retryPolicy)

        this.crmDeleteExhibitionStateMachine = new step.StateMachine(this, 'DeleteExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-delete-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: deleteExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(
                deleteExhibitionState
                    .next(deleteExhibitionDeleteAssetState)
                    .next(new step.Succeed(this, "Deleted"))
            )
        });
    }
}