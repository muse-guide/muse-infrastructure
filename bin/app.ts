#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {MuseStack} from "../lib/muse-stack";

const app = new cdk.App();

new MuseStack(app, 'MuseCrmStack', { // TODO: replace
    envName: "dev",
    domainName: "musee.cloud",
    certificateArn: "arn:aws:acm:us-east-1:654493660708:certificate/79ce51f2-1548-451e-a902-7798120f5a58"
})