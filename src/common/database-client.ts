import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION;
const IT_TEST = process.env.IT_TEST;

const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: false,
    convertClassInstanceToMap: false,
};

const unmarshallOptions = {
    wrapNumbers: false,
};

const translateConfig = { marshallOptions, unmarshallOptions };

const ddbClient = new DynamoDBClient(
    IT_TEST
        ? {
              endpoint: "http://localhost:8000",
              region: "local",
              credentials: {
                  accessKeyId: "test",
                  secretAccessKey: "test",
              },
          }
        : {
              region: REGION,
          }
);
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);

export { ddbDocClient };
