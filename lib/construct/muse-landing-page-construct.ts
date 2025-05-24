import * as cdk from "aws-cdk-lib";

export interface MuseLandingPageConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly consoleDomainName: string
    readonly certificateArn: string
}