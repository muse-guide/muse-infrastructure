import { APIGatewayProxyEvent } from "aws-lambda";
import { ddbDocClient } from "../common/database-client";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { BaseException, InternalServerErrorException, NotFoundException } from "../common/exceptions";
import { responseFormatter } from "../common/response-formatter";
import { Exhibition } from "../common/model/Exhibition";

export const handler = async (event: APIGatewayProxyEvent) => {
    const id = event.pathParameters?.id;
    const lang = event.pathParameters?.lang;
    try {
        const exhibition = await queryExhibitionTable(id, lang);
        return responseFormatter(200, exhibition);
    } catch (err) {
        console.error("Error:", err);
        let errorResponse: BaseException = new InternalServerErrorException(err);
        if (err instanceof BaseException) errorResponse = err;

        return errorResponse.formatResponse();
    }
};

const queryExhibitionTable = async (id?: string, lang?: string): Promise<Exhibition> => {
    const params = {
        TableName: process.env.EXHIBITION_TABLE,
        Key: {
            id: id,
            lang: lang,
        },
    };

    const data = await ddbDocClient.send(new GetCommand(params));
    const exhibition = data.Item as Exhibition;

    if (!exhibition) throw new NotFoundException(`Exhibition with id: ${id} not found.`);
    else return exhibition;
};
