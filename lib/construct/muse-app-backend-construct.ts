import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {GetExhibitionPreviewConstruct} from "./app-exhibition/GetExhibtionPreviewConstruct";
import {GetExhibitPreviewConstruct} from "./app-exhibit/GetExhibtPreviewConstruct";
import {GetExhibitPreviewsConstruct} from "./app-exhibit/GetExhibtPreviewsConstruct";

export interface MuseAppBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseAppBackendConstruct extends Construct {

    public readonly getExhibitionPreviewLambda: lambdaNode.NodejsFunction

    public readonly getExhibitPreviewLambda: lambdaNode.NodejsFunction
    public readonly getExhibitPreviewsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseAppBackendConstructProps) {
        super(scope, id);

        // Get Exhibition Preview Construct
        const getExhibitionPreviewConstruct = new GetExhibitionPreviewConstruct(this, 'GetExhibitionPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitionPreviewLambda = getExhibitionPreviewConstruct.getExhibitionPreviewLambda

        // Get Exhibit Preview Construct
        const getExhibitPreviewConstruct = new GetExhibitPreviewConstruct(this, 'GetExhibitPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitPreviewLambda = getExhibitPreviewConstruct.getExhibitPreviewLambda

        // Get Exhibit Previews Construct
        const getExhibitPreviewsConstruct = new GetExhibitPreviewsConstruct(this, 'GetExhibitPreviewsConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitPreviewsLambda = getExhibitPreviewsConstruct.getExhibitPreviewsLambda
    }
}