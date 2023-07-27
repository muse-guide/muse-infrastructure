import { ExhibitSnapshot } from "./Exhibit";

export interface Exhibition {
    id: string;
    institutionId: string;
    lang: string;
    langOptions: string[];
    title: string;
    subtitle: string;
    description: string;
    imageUrls: string[];
    exhibits: ExhibitSnapshot[];
}
