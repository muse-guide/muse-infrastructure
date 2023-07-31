#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {MuseCrmStack} from "../lib/crm/muse-crm-stack";

const app = new cdk.App();

new MuseCrmStack(app, 'MuseCrmStack', {
    envName: "dev"
})