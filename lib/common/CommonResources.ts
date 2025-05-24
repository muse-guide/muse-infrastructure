import * as cdk from "aws-cdk-lib";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import {Construct} from "constructs";

export function createUnlockSubscriptionParallelTask(scope: Construct, id: string, table: cdk.aws_dynamodb.Table): tasks.DynamoUpdateItem {
    return new tasks.DynamoUpdateItem(scope, `UnlockSubscription-${id}`, {
        key: {
            pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format(`$crm#subscriptionId_{}`, step.JsonPath.stringAt(`$[0].actor.subscriptionId`))),
            sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format(`$subscription_1#subscriptionId_{}`, step.JsonPath.stringAt(`$[0].actor.subscriptionId`))),
        },
        expressionAttributeNames: {
            '#S': "status"
        },
        expressionAttributeValues: {
            ':val': tasks.DynamoAttributeValue.fromString("ACTIVE")
        },
        table: table,
        updateExpression: 'SET #S=:val',
        outputPath: '$[0].actor.subscriptionId',
        resultPath: step.JsonPath.DISCARD
    })
}

export function createUnlockSubscriptionTask(scope: Construct, id: string, table: cdk.aws_dynamodb.Table): tasks.DynamoUpdateItem {
    return new tasks.DynamoUpdateItem(scope, `${id}-UnlockSubscription`, {
        key: {
            pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format(`$crm#subscriptionId_{}`, step.JsonPath.stringAt(`$.actor.subscriptionId`))),
            sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format(`$subscription_1#subscriptionId_{}`, step.JsonPath.stringAt(`$.actor.subscriptionId`))),
        },
        expressionAttributeNames: {
            '#S': "status"
        },
        expressionAttributeValues: {
            ':val': tasks.DynamoAttributeValue.fromString("ACTIVE")
        },
        table: table,
        updateExpression: 'SET #S=:val',
        outputPath: '$.actor.subscriptionId',
        resultPath: step.JsonPath.DISCARD
    })
}

export const assetProcessingError = (scope: Construct, id: string, table: cdk.aws_dynamodb.Table, resourceType: string) => {
    const parallelCreateExhibitFail = new step.Parallel(
        scope,
        `${id}-ParallelAssetProcessingFailed`
    );

    const setExhibitFailed = new tasks.DynamoUpdateItem(scope, `${id}-SetResourceStatusError`, {
        key: {
            pk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format('$muse#id_{}', step.JsonPath.stringAt('$.entityId'))),
            sk: tasks.DynamoAttributeValue.fromString(step.JsonPath.format(`$${resourceType}_1#id_{}`, step.JsonPath.stringAt('$.entityId'))),
        },
        expressionAttributeNames: {
            '#S': "status"
        },
        expressionAttributeValues: {
            ':val': tasks.DynamoAttributeValue.fromString("ERROR")
        },
        table: table,
        updateExpression: 'SET #S=:val',
        outputPath: '$.entityId',
        resultPath: step.JsonPath.DISCARD
    })

    const unlockSubscription = createUnlockSubscriptionTask(scope, id, table)

    parallelCreateExhibitFail.branch(setExhibitFailed)
    parallelCreateExhibitFail.branch(unlockSubscription);
    parallelCreateExhibitFail.next(new step.Fail(scope, `${id}-AssetProcessingFailed`))

    return parallelCreateExhibitFail
}