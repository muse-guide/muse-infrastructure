import {Construct} from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export interface ApiGatewayConstructProps {
    envName: string,
    application: string;
    throttle?: {
        rateLimit: number,
        burstLimit: number
    }
}

export class ApiGatewayConstruct extends Construct {

    public readonly api: apigateway.RestApi;
    public readonly apiKey: string;
    private apiKeyGenerator = (() => {
        const gen = (min: number, max: number) => max++ && [...Array(max - min)].map((s, i) => String.fromCharCode(min + i));

        const sets = {
            num: gen(48, 57),
            alphaLower: gen(97, 122),
            alphaUpper: gen(65, 90)
        };

        function* iter(len: number, set: string | any[]) {
            if (set.length < 1) set = Object.values(sets).flat();
            for (let i = 0; i < len; i++) yield set[Math.random() * set.length | 0];
        }

        return Object.assign(((len: number, ...set: any[]) => [...iter(len, set.flat())].join("")), sets);
    })();

    constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) { // TODO: add props with domain url
        super(scope, id);

        // REST API definition
        this.api = new apigateway.RestApi(this, "ApiGateway", {
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
        const plan = this.api.addUsagePlan("UsagePlan", {
            name: `${props.application}-${props.envName}-usage-plan`,
            throttle: {
                rateLimit: props.throttle?.rateLimit ?? 1,
                burstLimit: props.throttle?.burstLimit ?? 2
            }
        });

        this.apiKey = "JABsBGLyjCDx6fbWXRQX0v224oLhLo9HcpHK6ptHXHgIhNlx"; // TODO: replace with const apiKeyValue = this.apiKeyGenerator(48)
        const key = this.api.addApiKey("ApiKey", {
            description: "API key to restrict access to API GW only from distribution. TODO: move to secret manager or sth",
            value: this.apiKey
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
