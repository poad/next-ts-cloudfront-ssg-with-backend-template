#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "source-map-support/register";
import {
	NextCloudFrontTemplateStack,
	type NextCloudFrontTemplateStackConfig,
} from "../lib/cloudfront-s3-cdn-stack";
import { nextJsExport } from "../lib/process/setup";

const app = new cdk.App();

const env = app.node.tryGetContext("env");
const appName =
	app.node.tryGetContext("appName") ??
	`${env ? `${env}-` : ""}next-cloudfront-template`;

const config = app.node.tryGetContext(env) as NextCloudFrontTemplateStackConfig;

nextJsExport();

new NextCloudFrontTemplateStack(app, `${appName}-stack`, {
	appName,
	...config,
});
