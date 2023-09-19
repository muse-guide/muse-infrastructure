import { APIGatewayProxyEvent } from "aws-lambda";
import { ddbDocClient } from "../common/database-client";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { BaseException, InternalServerErrorException, NotFoundException } from "../common/exceptions";
import { responseFormatter } from "../common/response-formatter";
import { Exhibit } from "../common/model/Exhibit";

export const handler = async (event: APIGatewayProxyEvent) => {
    const id = event.pathParameters?.id;
    const lang = event.pathParameters?.lang;
    try {
        const exhibit = await queryExhibitTable(id, lang);
        return responseFormatter(200, exhibit);
    } catch (err) {
        console.error("Error:", err);
        let errorResponse: BaseException = new InternalServerErrorException(err);
        if (err instanceof BaseException) errorResponse = err;

        return errorResponse.formatResponse();
    }
};

const queryExhibitTable = async <T>(id?: string, lang?: string): Promise<T> => {
    const params = {
        TableName: process.env.EXHIBIT_TABLE,
        Key: {
            id: id,
            lang: lang,
        },
    };

    const data = await ddbDocClient.send(new GetCommand(params));
    const exhibit = data.Item as T;

    if (!exhibit) throw new NotFoundException(`Exhibit with id: ${id} not found.`);
    else return exhibit;
};
