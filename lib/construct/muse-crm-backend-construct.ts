import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import {Duration, RemovalPolicy} from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from "path";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import * as iam from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";

export interface MuseCrmBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseCrmBackendConstruct extends Construct {

    public readonly errorHandlerLambda: lambdaNode.NodejsFunction
    public readonly crmQrCodeGeneratorLambda: lambdaNode.NodejsFunction
    public readonly crmAssetProcessorLambda: lambdaNode.NodejsFunction
    public readonly crmGetExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmGetExhibitionsLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmDeleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmUpdateExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionStateMachine: step.StateMachine
    public readonly crmDeleteExhibitionStateMachine: step.StateMachine
    public readonly crmUpdateExhibitionStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Error handler
        this.errorHandlerLambda = new lambdaNode.NodejsFunction(this, "ErrorHandlerLambdaLambda", {
            functionName: `crm-${props.envName}-error-handler-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/error-handler.ts")
        });

        // QR code generator
        this.crmQrCodeGeneratorLambda = new lambdaNode.NodejsFunction(this, "CrmQrCodeGeneratorLambda", {
            functionName: `crm-${props.envName}-qr-code-generator-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/qr-code-generator.ts"),
            environment: {
                APP_DOMAIN: "https://duz68kh4juaad.cloudfront.net",
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket
            .grantWrite(this.crmQrCodeGeneratorLambda);

        // Asset processor
        this.crmAssetProcessorLambda = new lambdaNode.NodejsFunction(this, "CrmAssetProcessorLambda", {
            functionName: `crm-${props.envName}-asset-processor-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/asset-processor.ts"),
            environment: {
                CRM_ASSET_BUCKET: props.storage.crmAssetBucket.bucketName,
                APP_ASSET_BUCKET: props.storage.appAssetBucket.bucketName
            }
        });
        props.storage.crmAssetBucket.grantDelete(this.crmAssetProcessorLambda);
        props.storage.crmAssetBucket.grantReadWrite(this.crmAssetProcessorLambda);
        props.storage.appAssetBucket.grantDelete(this.crmAssetProcessorLambda);
        props.storage.appAssetBucket.grantReadWrite(this.crmAssetProcessorLambda);

        // Get Exhibition lambda
        this.crmGetExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionLambda", {
            functionName: `crm-${props.envName}-get-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionGetHandler",
            environment: {
                EXHIBITION_TABLE_NAME: props.storage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmExhibitionTable.tableArn,
                    `${props.storage.crmExhibitionTable.tableArn}/index/*`
                ]
            })
        );

        // Get Exhibitions lambda
        this.crmGetExhibitionsLambda = new lambdaNode.NodejsFunction(this, "CrmGetExhibitionsLambda", {
            functionName: `crm-${props.envName}-get-exhibitions-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionGetAllHandler",
            environment: {
                EXHIBITION_TABLE_NAME: props.storage.crmExhibitionTable.tableName
            }
        });
        this.crmGetExhibitionsLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [
                    props.storage.crmExhibitionTable.tableArn,
                    `${props.storage.crmExhibitionTable.tableArn}/index/*`
                ]
            })
        );

        // Create Exhibition lambda
        this.crmCreateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmCreateExhibitionLambda", {
            functionName: `crm-${props.envName}-create-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionCreateHandler",
            environment: {
                EXHIBITION_TABLE_NAME: props.storage.crmExhibitionTable.tableName,
            }
        });
        this.crmCreateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmExhibitionTable.tableArn]
            })
        );
        this.crmCreateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
            })
        );

        // Delete Exhibition lambda
        this.crmDeleteExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmDeleteExhibitionLambda", {
            functionName: `crm-${props.envName}-delete-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionDeleteHandler",
            environment: {
                EXHIBITION_TABLE_NAME: props.storage.crmExhibitionTable.tableName,
            }
        });
        this.crmDeleteExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmExhibitionTable.tableArn]
            })
        );

        // Update Exhibition lambda
        this.crmUpdateExhibitionLambda = new lambdaNode.NodejsFunction(this, "CrmUpdateExhibitionLambda", {
            functionName: `crm-${props.envName}-update-exhibition-lambda`,
            runtime: lambda.Runtime.NODEJS_20_X,
            // reservedConcurrentExecutions: 1 // TODO: increase quota for lambda
            entry: path.join(__dirname, "../../../muse-crm-server/src/exhibition-handler.ts"),
            handler: "exhibitionUpdateHandler",
            environment: {
                EXHIBITION_TABLE_NAME: props.storage.crmExhibitionTable.tableName,
            }
        });
        this.crmUpdateExhibitionLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:*"], // TODO: Tighten permissions
                resources: [props.storage.crmExhibitionTable.tableArn]
            })
        );

        const commonRetry: cdk.aws_stepfunctions.RetryProps = {
            maxAttempts: 3,
            backoffRate: 2,
            interval: Duration.seconds(1)
        }

        // Create Exhibition Step Function
        const createExhibitionLogGroup = new LogGroup(this, 'CrmCreateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.crmCreateExhibitionStateMachine = new step.StateMachine(this, 'CreateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-create-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: createExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(new tasks.LambdaInvoke(this, "CreateExhibition",
                {
                    lambdaFunction: this.crmCreateExhibitionLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(commonRetry)
                .addCatch(new tasks.LambdaInvoke(this, "CreateExhibitionErrorHandler",
                    {
                        lambdaFunction: this.errorHandlerLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                    .next(new step.Fail(this, "CreateExhibitionFail",
                            {
                                errorPath: step.JsonPath.stringAt('$.error'),
                                causePath: step.JsonPath.stringAt('$.cause'),
                            }
                        )
                    )
                )
                .next(new tasks.LambdaInvoke(this, "GenerateQrCode",
                    {
                        lambdaFunction: this.crmQrCodeGeneratorLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                )
                .next(new tasks.LambdaInvoke(this, "CreateExhibitionProcessAsset",
                    {
                        lambdaFunction: this.crmAssetProcessorLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                )
                .next(new step.Succeed(this, "Created", {
                    outputPath: '$.mutation.entityId',
                }))
            )
        });

        // Update Exhibition Step Function
        const updateExhibitionLogGroup = new LogGroup(this, 'CrmUpdateExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.crmUpdateExhibitionStateMachine = new step.StateMachine(this, 'UpdateExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-update-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: updateExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(new tasks.LambdaInvoke(this, "UpdateExhibition",
                {
                    lambdaFunction: this.crmUpdateExhibitionLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(commonRetry)
                .addCatch(new tasks.LambdaInvoke(this, "UpdateExhibitionErrorHandler",
                    {
                        lambdaFunction: this.errorHandlerLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                    .next(new step.Fail(this, "UpdateExhibitionFail",
                            {
                                errorPath: step.JsonPath.stringAt('$.error'),
                                causePath: step.JsonPath.stringAt('$.cause'),
                            }
                        )
                    )
                )
                .next(new tasks.LambdaInvoke(this, "UpdateExhibitionProcessAsset",
                    {
                        lambdaFunction: this.crmAssetProcessorLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                )
                .next(new step.Succeed(this, "Updated", {
                    outputPath: '$.mutation.entityId',
                }))
            )
        });

        // Delete Exhibition Step Function
        const deleteExhibitionLogGroup = new LogGroup(this, 'CrmDeleteExhibitionLogGroup', {
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.crmDeleteExhibitionStateMachine = new step.StateMachine(this, 'DeleteExhibitionStateMachine', {
            stateMachineName: `crm-${props.envName}-delete-exhibition-state-machine`,
            stateMachineType: step.StateMachineType.EXPRESS,
            logs: {
                destination: deleteExhibitionLogGroup,
                level: step.LogLevel.ALL,
                includeExecutionData: true,
            },
            definitionBody: step.DefinitionBody.fromChainable(new tasks.LambdaInvoke(this, "DeleteExhibition",
                {
                    lambdaFunction: this.crmDeleteExhibitionLambda,
                    outputPath: '$.Payload',
                })
                .addRetry(commonRetry)
                .addCatch(new tasks.LambdaInvoke(this, "DeleteExhibitionErrorHandler",
                    {
                        lambdaFunction: this.errorHandlerLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                    .next(new step.Fail(this, "DeleteExhibitionFail",
                            {
                                errorPath: step.JsonPath.stringAt('$.error'),
                                causePath: step.JsonPath.stringAt('$.cause'),
                            }
                        )
                    )
                )
                .next(new tasks.LambdaInvoke(this, "DeleteExhibitionProcessAsset",
                    {
                        lambdaFunction: this.crmAssetProcessorLambda,
                        outputPath: '$.Payload',
                    })
                    .addRetry(commonRetry)
                )
                .next(new step.Succeed(this, "Deleted", {
                    outputPath: '$.mutation.entityId',
                }))
            )
        });
    }
}