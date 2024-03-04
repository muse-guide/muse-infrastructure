import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as step from "aws-cdk-lib/aws-stepfunctions";
import {MuseCrmStorageConstruct} from "./muse-crm-storage-construct";
import {MuseCrmSharedLambdasConstruct} from "./muse-crm-shared-lambdas-construct";
import {MuseCrmCreateExhibitionConstruct} from "./crm-exhibition/muse-crm-create-exhibition-construct";
import {MuseCrmUpdateExhibitionConstruct} from "./crm-exhibition/muse-crm-update-exhibition-construct";
import {MuseCrmDeleteExhibitionConstruct} from "./crm-exhibition/muse-crm-delete-exhibition-construct";
import {MuseCrmGetExhibitionConstruct} from "./crm-exhibition/muse-crm-get-exhibtion-construct";
import {MuseCrmGetExhibitionsConstruct} from "./crm-exhibition/muse-crm-get-exhibtions-construct";
import {CreateExhibitConstruct} from "./crm-exhibit/CreateExhibitConstruct";

export interface MuseCrmBackendConstructProps extends cdk.StackProps {
    readonly envName: string,
    readonly storage: MuseCrmStorageConstruct
}

export class MuseCrmBackendConstruct extends Construct {

    // Exhibition
    public readonly crmGetExhibitionLambda: lambdaNode.NodejsFunction
    public readonly crmGetExhibitionsLambda: lambdaNode.NodejsFunction
    public readonly crmCreateExhibitionStateMachine: step.StateMachine
    public readonly crmUpdateExhibitionStateMachine: step.StateMachine
    public readonly crmDeleteExhibitionStateMachine: step.StateMachine

    // Exhibit
    public readonly createExhibitLambda: lambdaNode.NodejsFunction
    public readonly createExhibitStateMachine: step.StateMachine

    constructor(scope: Construct, id: string, props: MuseCrmBackendConstructProps) {
        super(scope, id);

        // Shared lambdas
        const sharedLambdas = new MuseCrmSharedLambdasConstruct(this, 'CrmSharedLambdas', {
            envName: props.envName,
            storage: props.storage
        });

        // Get Exhibition Construct
        const getExhibitionConstruct = new MuseCrmGetExhibitionConstruct(this, 'CrmGetExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.crmGetExhibitionLambda = getExhibitionConstruct.crmGetExhibitionLambda


        // Get Exhibitions Construct
        const getExhibitionsConstruct = new MuseCrmGetExhibitionsConstruct(this, 'CrmGetExhibitionsConstruct', {
            envName: props.envName,
            storage: props.storage,
        });

        this.crmGetExhibitionsLambda = getExhibitionsConstruct.crmGetExhibitionsLambda

        // Create Exhibition Construct
        const createExhibitionConstruct = new MuseCrmCreateExhibitionConstruct(this, 'CrmCreateExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            crmImageProcessorLambda: sharedLambdas.crmImageProcessorLambda,
            errorHandlerLambda: sharedLambdas.errorHandlerLambda,
            crmQrCodeGeneratorLambda: sharedLambdas.crmQrCodeGeneratorLambda
        });

        this.crmCreateExhibitionStateMachine = createExhibitionConstruct.crmCreateExhibitionStateMachine;

        // Update Exhibition Construct
        const updateExhibitionConstruct = new MuseCrmUpdateExhibitionConstruct(this, 'CrmUpdateExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            crmImageProcessorLambda: sharedLambdas.crmImageProcessorLambda,
            errorHandlerLambda: sharedLambdas.errorHandlerLambda,
            crmDeleteAssetLambda: sharedLambdas.crmDeleteAssetLambda
        });

        this.crmUpdateExhibitionStateMachine = updateExhibitionConstruct.crmUpdateExhibitionStateMachine;

        // Delete Exhibition Construct
        const crmDeleteExhibitionConstruct = new MuseCrmDeleteExhibitionConstruct(this, 'CrmDeleteExhibitionConstruct', {
            envName: props.envName,
            storage: props.storage,
            errorHandlerLambda: sharedLambdas.errorHandlerLambda,
            crmDeleteAssetLambda: sharedLambdas.crmDeleteAssetLambda
        });

        this.crmDeleteExhibitionStateMachine = crmDeleteExhibitionConstruct.crmDeleteExhibitionStateMachine;

        // Create Exhibit Construct
        const createExhibitConstruct = new CreateExhibitConstruct(this, 'CreateExhibitConstruct', {
            envName: props.envName,
            storage: props.storage,
            imageProcessorLambda: sharedLambdas.crmImageProcessorLambda,
            errorHandlerLambda: sharedLambdas.errorHandlerLambda,
            qrCodeGeneratorLambda: sharedLambdas.crmQrCodeGeneratorLambda,
            audioProcessorLambda: sharedLambdas.crmAudioProcessorLambda
        });

        this.createExhibitLambda = createExhibitConstruct.createExhibitLambda
        this.createExhibitStateMachine = createExhibitConstruct.createExhibitStateMachine
    }
}