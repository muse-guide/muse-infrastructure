export abstract class BaseException extends Error {
    statusCode: number;
    message: string;
    cause: unknown;

    constructor(statusCode: number, message: string, cause?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.cause = cause;
    }

    formatResponse() {
        return {
            statusCode: this.statusCode,
            body: JSON.stringify({
                message: this.message,
            }),
            headers: {
                "Content-Type": "application/json",
            },
        };
    }
}

export class BadRequestException extends BaseException {
    constructor(message: string, cause?: unknown) {
        super(400, message, cause);
    }
}

export class NotFoundException extends BaseException {
    constructor(message: string, cause?: unknown) {
        super(404, message, cause);
    }
}

export class InternalServerErrorException extends BaseException {
    constructor(cause?: unknown) {
        super(500, "Internal server error occurred.", cause);
    }
}
