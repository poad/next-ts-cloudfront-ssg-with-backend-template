import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as awslogs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
	appName: string;
	parameterName: string;
	githubOauth: {
		clientId: string;
		clientSecret: string;
	};
}

export class BackendStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: BackendStackProps) {
		super(scope, id, props);

		const {
			appName,
			parameterName,
			githubOauth: { clientId, clientSecret },
		} = props;

		const functionName = `${appName}-api`;
		const logs = new awslogs.LogGroup(this, "LogGroup", {
			logGroupName: `/aws/lambda/${functionName}`,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			retention: awslogs.RetentionDays.THREE_DAYS,
		});

		const fn = new nodejs.NodejsFunction(this, "LambdaFunction", {
			functionName,
			runtime: lambda.Runtime.NODEJS_20_X,
			architecture: lambda.Architecture.ARM_64,
			entry: "./lambda/index.ts",
			retryAttempts: 0,
			environment: {
				LOG_LEVEL: "info",
				NODE_OPTIONS: "–enable-source-maps",
				GITHUB_OAUTH_CLIENT_ID: clientId,
				GITHUB_OAUTH_CLIENT_SECRET: clientSecret,
			},
			bundling: {
				minify: true,
				sourceMap: true,
				sourceMapMode: nodejs.SourceMapMode.BOTH,
				sourcesContent: true,
				keepNames: true,
				target: "node18",
			},
			role: new iam.Role(this, "LambdaFunctionRole", {
				roleName: `${functionName}-role`,
				assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
				inlinePolicies: {
					"logs-policy": new iam.PolicyDocument({
						statements: [
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
								resources: [`${logs.logGroupArn}:*`],
							}),
						],
					}),
				},
			}),
		});

		const api = new apigateway.RestApi(this, "APIGateway", {
			restApiName: "GitHub OAuth API",
			description: "API for GitHub OAuth",
			deployOptions: {
				stageName: "default",
			},
			endpointConfiguration: {
				types: [apigateway.EndpointType.REGIONAL],
			},
			defaultCorsPreflightOptions: {
				allowOrigins: apigateway.Cors.ALL_ORIGINS,
				allowMethods: apigateway.Cors.ALL_METHODS,
				allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
				allowCredentials: true,
				disableCache: true,
				statusCode: 204,
			},
		});

		api.deploymentStage.urlForPath("/");

		api.root.addMethod("POST", new apigateway.LambdaIntegration(fn));

		new apigateway.GatewayResponse(this, "ClientErrorGatewayResponse", {
			restApi: api,
			type: apigateway.ResponseType.DEFAULT_4XX,
			responseHeaders: {
				"Access-Control-Allow-Origin": "'*'",
			},
		});

		new apigateway.GatewayResponse(this, "ServerErrorGatewayResponse", {
			restApi: api,
			type: apigateway.ResponseType.DEFAULT_5XX,
			responseHeaders: {
				"Access-Control-Allow-Origin": "'*'",
			},
		});

		new ssm.StringParameter(this, "ApiEndpointParameter", {
			parameterName,
			stringValue: api.url,
		});
	}
}
