#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import {MuseAppConstruct} from "../lib/muse-app-construct";

const app = new cdk.App();

new InfrastructureStack(app, 'InfrastructureStack', {
    envName: "dev"
})