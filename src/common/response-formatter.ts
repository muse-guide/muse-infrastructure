export const responseFormatter = (statusCode: number, response: object) => {
    return {
        statusCode: statusCode,
        body: JSON.stringify(response, (key, value) => (value instanceof Set ? [...value] : value)),
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
            "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE"
        }
    };
};
