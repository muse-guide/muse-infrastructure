import {Construct} from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import {nanoid} from 'nanoid';

export interface ApiGatewayConstructProps {
    envName: string,
    apiKey: string,
    application: string;
    throttle?: {
        rateLimit: number,
        burstLimit: number
    }
}

export class ApiGatewayConstruct extends Construct {

    public readonly api: apigateway.RestApi;

    constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) { // TODO: add props with domain url
        super(scope, id);

        const appCapitalized = props.application.charAt(0).toUpperCase() + props.application.slice(1);

        // REST API definition
        this.api = new apigateway.RestApi(this, `${appCapitalized}ApiGateway`, {
            restApiName: `${props.application}-${props.envName}-api-gateway`,
            defaultMethodOptions: {
                apiKeyRequired: true
            },
            deployOptions: {
                stageName: props.envName
            },
            defaultCorsPreflightOptions: {
                allowOrigins: ['*'],
                allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
                allowCredentials: true,
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL]
            }
        });

        // Usage plan and API key definition
        const plan = this.api.addUsagePlan(`${appCapitalized}UsagePlan`, {
            name: `${props.application}-${props.envName}-usage-plan`,
            throttle: {
                rateLimit: props.throttle?.rateLimit ?? 1,
                burstLimit: props.throttle?.burstLimit ?? 2
            }
        });

        const key = this.api.addApiKey(`${appCapitalized}ApiKey`, {
            description: "API key to restrict access to API GW only from distribution. TODO: move to secret manager or sth",
            value: props.apiKey
        });
        plan.addApiKey(key);
        plan.addApiStage({
            stage: this.api.deploymentStage
        });

        // Add default API response definition
        this.api.root.addResource("{proxy+}").addMethod(
            "ANY",
            new apigateway.MockIntegration({
                passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
                requestTemplates: {
                    "application/json": `{"statusCode": 404}`
                },
                integrationResponses: [
                    {
                        statusCode: "404",
                        responseTemplates: {
                            "application/json": `{ "message": "Resource $context.path not found !" }`
                        }
                    }
                ]
            }),
            {
                methodResponses: [
                    {
                        statusCode: "404",
                        responseModels: {
                            "application/json": apigateway.Model.ERROR_MODEL
                        }
                    }
                ]
            }
        );
    }
}
