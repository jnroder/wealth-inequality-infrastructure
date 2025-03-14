// infrastructure/lib/infrastructure-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda and API Gateway setup

    // FRED net worth of top 1% Lambda
    const fredHandler = new NodejsFunction(this, "FredDataHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, "../..", "server", "fred-lambda.ts"),
      handler: "handlerOnePercent",
      timeout: cdk.Duration.seconds(10),
      environment: {
        FRED_API_KEY: process.env.FRED_API_KEY || "",
      },
    });

    // FRED Earnings Gap Lambda
    const fredEarningsGapHandler = new NodejsFunction(this, 'FredEarningsGapHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../..', 'server', 'fred-lambda.ts'),
      handler: 'handlerEarningsGap',
      timeout: cdk.Duration.seconds(10),
      environment: {
        FRED_API_KEY: process.env.FRED_API_KEY || '',
      },
    });

    // Census Lambda
    const censusHandler = new NodejsFunction(this, 'CensusDataHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../..', 'server', 'census-lambda.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        CENSUS_API_KEY: process.env.CENSUS_API_KEY || '',
      },
    });

    const api = new apigateway.RestApi(this, 'WealthInequalityApi', {
      restApiName: 'Wealth Inequality Data Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
      },
    });

    // FRED endpoint
    const fredData = api.root.addResource('wealth-data');
    fredData.addMethod('GET', new apigateway.LambdaIntegration(fredHandler));

    const fredEarningsGap = api.root.addResource('earnings-gap');
    fredEarningsGap.addMethod('GET', new apigateway.LambdaIntegration(fredEarningsGapHandler));

    // Census endpoint
    const censusData = api.root.addResource('census-data');
    censusData.addMethod('GET', new apigateway.LambdaIntegration(censusHandler));

    // S3 Frontend setup
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // Deploy site contents to S3
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../dist')],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Output the URLs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'WebsiteUrl', { value: distribution.distributionDomainName });
  }
}