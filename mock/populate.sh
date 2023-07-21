#!/bin/bash

# Setup AWS credentials
export AWS_PROFILE=deployment
export AWS_REGION=eu-central-1

# Populate Exhibit table
aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1000/pl.json

aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1000/gb.json

aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1001/pl.json

aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1001/gb.json

aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1002/pl.json

aws dynamodb put-item \
    --table-name muse-exhibit-table-dev \
    --item file://dynamo/exhibit/1002/gb.json

# Populate Exhibition table
aws dynamodb put-item \
    --table-name muse-exhibition-table-dev \
    --item file://dynamo/exhibition/1000/pl.json

aws dynamodb put-item \
    --table-name muse-exhibition-table-dev \
    --item file://dynamo/exhibition/1000/gb.json

# Populate asset S3
aws s3 cp s3/asset/ s3://muse-asset-bucket-dev/asset --recursive