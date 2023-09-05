import * as crypto from "crypto";
/* eslint-disable no-new */
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origin from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as deployment from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

export type NextCloudFrontTemplateStackConfig = {};

interface NextCloudFrontTemplateStackProps
	extends NextCloudFrontTemplateStackConfig,
		cdk.StackProps {
	appName: string;
}

export class NextCloudFrontTemplateStack extends cdk.Stack {
	constructor(
		scope: Construct,
		id: string,
		props: NextCloudFrontTemplateStackProps,
	) {
		super(scope, id, props);

		const { account, region } = this;

		const { appName } = props;

		const hash = crypto
			.createHash("md5")
			.update(new Date().getTime().toString())
			.digest("hex");

		const s3BucketName = appName;

		const distoribution = new cloudfront.Distribution(this, "CloudFront", {
			comment: `for ${appName}`,
			defaultBehavior: {
				origin: new origin.HttpOrigin(
					`${s3BucketName}.s3-website-${region}.amazonaws.com`,
					{
						customHeaders: {
							Referer: hash,
						},
						protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
					},
				),
				cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
			},
			enableIpv6: false,
			defaultRootObject: "index.html",
		});

		const s3bucket = new s3.Bucket(this, "S3Bucket", {
			bucketName: s3BucketName,
			versioned: false,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
			accessControl: s3.BucketAccessControl.PRIVATE,
			publicReadAccess: false,
			websiteIndexDocument: "index.html",
		});

		const deployRole = new iam.Role(this, "DeployWebsiteRole", {
			roleName: `${appName}-deploy-role`,
			assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
			inlinePolicies: {
				"s3-policy": new iam.PolicyDocument({
					statements: [
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: ["s3:*"],
							resources: [`${s3bucket.bucketArn}/`, `${s3bucket.bucketArn}/*`],
						}),
					],
				}),
			},
		});

		s3bucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.DENY,
				actions: ["s3:*"],
				principals: [new iam.StarPrincipal()],
				resources: [`${s3bucket.bucketArn}/*`],
				conditions: {
					StringNotLike: {
						"aws:Referer": hash,
					},
					StringNotEquals: {
						"s3:ResourceAccount": account,
						"aws:PrincipalArn": new iam.ArnPrincipal(deployRole.roleArn).arn,
					},
				},
			}),
		);
		s3bucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["s3:GetObject"],
				principals: [new iam.StarPrincipal()],
				resources: [`${s3bucket.bucketArn}/*`],
				conditions: {
					StringLike: {
						"aws:Referer": hash,
					},
				},
			}),
		);
		s3bucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["s3:*"],
				principals: [new iam.AccountPrincipal(account)],
				resources: [`${s3bucket.bucketArn}/*`],
				conditions: {
					StringEquals: {
						"s3:ResourceAccount": account,
					},
				},
			}),
		);

		new deployment.BucketDeployment(this, "DeployWebsite", {
			sources: [deployment.Source.asset(`${process.cwd()}/../out`)],
			destinationBucket: s3bucket,
			destinationKeyPrefix: "/",
			exclude: [".DS_Store", "*/.DS_Store"],
			prune: true,
			retainOnDelete: false,
			role: deployRole,
		});

		new cdk.CfnOutput(this, "AccessURLOutput", {
			value: `https://${distoribution.distributionDomainName}`,
		});
	}
}
