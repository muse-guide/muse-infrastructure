import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {MuseCrmSharedLambdasConstruct} from "./muse-crm-shared-lambdas-construct";
import {CreateExhibitConstruct} from "./crm-exhibit/CreateExhibitConstruct";
import {GetExhibitConstruct} from "./crm-exhibit/GetExhibtConstruct";
import {GetExhibitsConstruct} from "./crm-exhibit/GetExhibtsConstruct";
import {DeleteExhibitConstruct} from "./crm-exhibit/DeleteExhibitConstruct";
import {UpdateExhibitConstruct} from "./crm-exhibit/UpdateExhibitConstruct";
import {AudioPreviewConstruct} from "./crm-audio/AudioPreviewConstruct";
import {CreateExhibitionConstruct} from "./crm-exhibition/CreateExhibitionConstruct";
import {GetExhibitionConstruct} from "./crm-exhibition/GetExhibtionConstruct";
import {GetExhibitionsConstruct} from "./crm-exhibition/GetExhibtionsConstruct";
import {DeleteExhibitionConstruct} from "./crm-exhibition/DeleteExhibitionConstruct";
import {UpdateExhibitionConstruct} from "./crm-exhibition/UpdateExhibitionConstruct";
import {GetCustomerConstruct} from "./crm-customer/GetCustomerConstruct";
import {UpdateSubscriptionConstruct} from "./crm-customer/UpdateSubscriptionConstruct";
import {GetConfigurationConstruct} from "./crm-configuration/GetConfigurationConstruct";
import {UpdateCustomerDetailsConstruct} from "./crm-customer/UpdateCustomerDetailsConstruct";
import {IssueInvoicesConstruct} from "./crm-invoice/IssueInvoicesConstruct";
import {GetInvoicesConstruct} from "./crm-invoice/GetInvoicesConstruct";
import {GetInvoiceConstruct} from "./crm-invoice/GetInvoiceConstruct";

export interface MuseCrmBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseCrmBackendConstruct extends Construct {

    // Configuration
    public readonly getConfigurationLambda: lambdaNode.NodejsFunction

    // Customer
    public readonly getCustomerLambda: lambdaNode.NodejsFunction
    public readonly updateSubscriptionLambda: lambdaNode.NodejsFunction
    public readonly updateCustomerDetailsLambda: lambdaNode.NodejsFunction

    // Invoices
    public readonly getInvoicesLambda: lambdaNode.NodejsFunction
    public readonly getInvoiceLambda: lambdaNode.NodejsFunction

    // Exhibition
    public readonly createExhibitionLambda: lambdaNode.NodejsFunction
    public readonly getExhibitionLambda: lambdaNode.NodejsFunction
    public readonly getExhibitionsLambda: lambdaNode.NodejsFunction
    public readonly deleteExhibitionLambda: lambdaNode.NodejsFunction
    public readonly updateExhibitionLambda: lambdaNode.NodejsFunction

    // Exhibit
    public readonly createExhibitLambda: lambdaNode.NodejsFunction
    public readonly getExhibitLambda: lambdaNode.NodejsFunction
    public readonly getExhibitsLambda: lambdaNode.NodejsFunction
    public readonly deleteExhibitLambda: lambdaNode.NodejsFunction
    public readonly updateExhibitLambda: lambdaNode.NodejsFunction

    // Audio
    public readonly generateAudioPreviewLambda: lambdaNode.NodejsFunction


    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Shared lambdas
        const sharedLambdas = new MuseCrmSharedLambdasConstruct(this, 'CrmSharedLambdas', {
            envName: props.envName,
            storage: props.storage
        });

        // Get Configuration Construct
        const getConfigurationConstruct = new GetConfigurationConstruct(this, 'GetConfigurationConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getConfigurationLambda = getConfigurationConstruct.getConfigurationLambda

        // Get Customer Construct
        const getCustomerConstruct = new GetCustomerConstruct(this, 'GetCustomerConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getCustomerLambda = getCustomerConstruct.getCustomerLambda

        // Change Customer Subscription Construct
        const updateSubscriptionConstruct = new UpdateSubscriptionConstruct(this, 'UpdateSubscriptionConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.updateSubscriptionLambda = updateSubscriptionConstruct.updateSubscriptionLambda

        // Update Customer Details Construct
        const updateCustomerDetailsConstruct = new UpdateCustomerDetailsConstruct(this, 'UpdateCustomerDetailsConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.updateCustomerDetailsLambda = updateCustomerDetailsConstruct.updateCustomerDetailsLambda

        // Create Exhibition Construct
        const createExhibitionConstruct = new CreateExhibitionConstruct(this, 'CreateExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            imageProcessorLambda: sharedLambdas.imageProcessorLambda,
            qrCodeGeneratorLambda: sharedLambdas.qrCodeGeneratorLambda,
            audioProcessorLambda: sharedLambdas.audioProcessorLambda
        });

        this.createExhibitionLambda = createExhibitionConstruct.createExhibitionLambda

        // Get Exhibition Construct
        const getExhibitionConstruct = new GetExhibitionConstruct(this, 'GetExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitionLambda = getExhibitionConstruct.getExhibitionLambda

        // Get Exhibitions Construct
        const getExhibitionsConstruct = new GetExhibitionsConstruct(this, 'GetExhibitionsConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitionsLambda = getExhibitionsConstruct.getExhibitionsLambda

        // Delete Exhibition Construct
        const deleteExhibitionConstruct = new DeleteExhibitionConstruct(this, 'DeleteExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            deleteAssetLambda: sharedLambdas.deleteAssetLambda,
            cdnManagerLambda: sharedLambdas.cdnManagerLambda
        });

        this.deleteExhibitionLambda = deleteExhibitionConstruct.deleteExhibitionLambda

        // Update Exhibition Construct
        const updateExhibitionConstruct = new UpdateExhibitionConstruct(this, 'UpdateExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            imageProcessorLambda: sharedLambdas.imageProcessorLambda,
            audioProcessorLambda: sharedLambdas.audioProcessorLambda,
            deleteAssetLambda: sharedLambdas.deleteAssetLambda,
            cdnManagerLambda: sharedLambdas.cdnManagerLambda
        });

        this.updateExhibitionLambda = updateExhibitionConstruct.updateExhibitionLambda

        // Create Exhibit Construct
        const createExhibitConstruct = new CreateExhibitConstruct(this, 'CreateExhibitConstruct', {
            envName: props.envName,
            storage: props.storage,
            imageProcessorLambda: sharedLambdas.imageProcessorLambda,
            qrCodeGeneratorLambda: sharedLambdas.qrCodeGeneratorLambda,
            audioProcessorLambda: sharedLambdas.audioProcessorLambda,
            cdnManagerLambda: sharedLambdas.cdnManagerLambda
        });

        this.createExhibitLambda = createExhibitConstruct.createExhibitLambda

        // Get Exhibit Construct
        const getExhibitConstruct = new GetExhibitConstruct(this, 'GetExhibitConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitLambda = getExhibitConstruct.getExhibitLambda

        // Get Exhibits Construct
        const getExhibitsConstruct = new GetExhibitsConstruct(this, 'GetExhibitsConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getExhibitsLambda = getExhibitsConstruct.getExhibitsLambda

        // Delete Exhibit Construct
        const deleteExhibitConstruct = new DeleteExhibitConstruct(this, 'DeleteExhibitConstruct', {
            envName: props.envName,
            storage: props.storage,
            deleteAssetLambda: sharedLambdas.deleteAssetLambda,
            cdnManagerLambda: sharedLambdas.cdnManagerLambda
        });

        this.deleteExhibitLambda = deleteExhibitConstruct.deleteExhibitLambda

        // Update Exhibit Construct
        const updateExhibitConstruct = new UpdateExhibitConstruct(this, 'UpdateExhibitConstruct', {
            envName: props.envName,
            storage: props.storage,
            imageProcessorLambda: sharedLambdas.imageProcessorLambda,
            audioProcessorLambda: sharedLambdas.audioProcessorLambda,
            deleteAssetLambda: sharedLambdas.deleteAssetLambda,
            cdnManagerLambda: sharedLambdas.cdnManagerLambda
        });

        this.updateExhibitLambda = updateExhibitConstruct.updateExhibitLambda

        // Generate Audio Preview Construct
        const generateAudioPreviewConstruct = new AudioPreviewConstruct(this, 'AudioPreviewConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.generateAudioPreviewLambda = generateAudioPreviewConstruct.audioPreviewLambda

        // Issue invoices construct
        const issueInvoicesConstruct = new IssueInvoicesConstruct(this, 'IssueInvoicesConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        // Get customer invoices
        const getInvoicesConstruct = new GetInvoicesConstruct(this, 'GetInvoicesConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getInvoicesLambda = getInvoicesConstruct.getInvoicesLambda

        // Get invoice
        const getInvoiceConstruct = new GetInvoiceConstruct(this, 'GetInvoiceConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.getInvoiceLambda = getInvoiceConstruct.getInvoiceLambda
    }
}