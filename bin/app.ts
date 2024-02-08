#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {MuseStack} from "../lib/muse-stack";

const app = new cdk.App();

new MuseStack(app, 'MuseCrmStack', { // TODO: replace
    envName: "dev"
})