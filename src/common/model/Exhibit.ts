export interface Exhibit {
    id: string;
    number: number;
    exhibitionId: string;
    lang: string;
    langOptions: string[];
    title: string;
    subtitle: string;
    description: string;
    audioUrl: string;
    imageUrl: string;
    nextExhibitId?: string;
    prevExhibitId?: string;
    artistId?: string;
}

export interface ExhibitSnapshot {
    id: string;
    number: number;
    title: string;
    audioLength: number;
    thumbnailUrl: string;
}
