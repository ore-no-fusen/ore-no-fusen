import type { CrystalSpec } from './crystalFormat';

export type CrystalType = 'recipe' | 'qa' | 'term';
export type CrystalSlot =
    | 'situation'
    | 'steps'
    | 'question'
    | 'answer'
    | 'name'
    | 'gist'
    | 'detail'
    | 'source'
    | 'supplement'
    | 'history'
    | 'free';

export interface CrystalSectionConfig {
    label: string;
    slot: CrystalSlot;
    tracked: boolean;
}

export interface CrystalTypeFormat {
    sections: CrystalSectionConfig[];
}

export interface CrystalFormats {
    version: 1;
    recipe: CrystalTypeFormat;
    qa: CrystalTypeFormat;
    term: CrystalTypeFormat;
}

export function configToSpec(format: CrystalTypeFormat): CrystalSpec {
    return {
        sectionNames: format.sections.map((section) => section.label),
        trackedSectionNames: format.sections
            .filter((section) => section.tracked)
            .map((section) => section.label),
    };
}
