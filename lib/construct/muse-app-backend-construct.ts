import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {GetExhibitionPreviewConstruct} from "./app-exhibition/GetExhibitionPreviewConstruct";
import {GetExhibitPreviewConstruct} from "./app-exhibit/GetExhibtPreviewConstruct";
import {GetExhibitPreviewsConstruct} from "./app-exhibit/GetExhibtPreviewsConstruct";
import {GetInstitutionPreviewConstruct} from "./app-institution/GetInstitutionPreviewConstruct";
import {GetExhibitionPreviewsConstruct} from "./app-exhibition/GetExhibtionPreviewsConstruct";

export interface MuseAppBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
    readonly appDomainName: string
}

export class MuseAppBackendConstruct extends Construct {

    public readonly getInstitutionPreviewLambda: lambdaNode.NodejsFunction

    public readonly getExhibitionPreviewLambda: lambdaNode.NodejsFunction
    public readonly getExhibitionPreviewsLambda: lambdaNode.NodejsFunction

    public readonly getExhibitPreviewLambda: lambdaNode.NodejsFunction
    public readonly getExhibitPreviewsLambda: lambdaNode.NodejsFunction

    constructor(scope: Construct, id: string, props: MuseAppBackendConstructProps) {
        super(scope, id);

        // Get Institution Preview Construct
        const getInstitutionPreviewConstruct = new GetInstitutionPreviewConstruct(this, 'GetInstitutionPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
            appDomainName: props.appDomainName
        });

        this.getInstitutionPreviewLambda = getInstitutionPreviewConstruct.getInstitutionPreviewLambda

        // Get Exhibition Preview Construct
        const getExhibitionPreviewConstruct = new GetExhibitionPreviewConstruct(this, 'GetExhibitionPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
            appDomainName: props.appDomainName
        });

        this.getExhibitionPreviewLambda = getExhibitionPreviewConstruct.getExhibitionPreviewLambda

        // Get Exhibition Previews Construct
        const getExhibitionPreviewsConstruct = new GetExhibitionPreviewsConstruct(this, 'GetExhibitionPreviewsConstruct', {
            envName: props.envName,
            storage: props.storage,
            appDomainName: props.appDomainName
        });

        this.getExhibitionPreviewsLambda = getExhibitionPreviewsConstruct.getExhibitionPreviewsLambda

        // Get Exhibit Preview Construct
        const getExhibitPreviewConstruct = new GetExhibitPreviewConstruct(this, 'GetExhibitPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
            appDomainName: props.appDomainName
        });

        this.getExhibitPreviewLambda = getExhibitPreviewConstruct.getExhibitPreviewLambda

        // Get Exhibit Previews Construct
        const getExhibitPreviewsConstruct = new GetExhibitPreviewsConstruct(this, 'GetExhibitPreviewsConstruct', {
            envName: props.envName,
            storage: props.storage,
            appDomainName: props.appDomainName
        });

        this.getExhibitPreviewsLambda = getExhibitPreviewsConstruct.getExhibitPreviewsLambda
    }
}