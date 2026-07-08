import { invoke } from '@tauri-apps/api/core';

export type RecipeCandidate = {
    path: string;
    title: string;
    preview: string;
    tags: string[];
};

export type RecipeCandidates = {
    yellows: RecipeCandidate[];
    pinks: RecipeCandidate[];
};

export type CreateRecipeNoteRequest = {
    title: string;
    body: string;
    tags: string[];
};

export async function getRecipeCandidates(sourcePath: string): Promise<RecipeCandidates> {
    return await invoke<RecipeCandidates>('fusen_get_recipe_candidates', { sourcePath });
}

export async function createRecipeNote(request: CreateRecipeNoteRequest): Promise<string> {
    return await invoke<string>('fusen_create_recipe_note', { request });
}

export async function createQaNote(request: CreateRecipeNoteRequest): Promise<string> {
    return await invoke<string>('fusen_create_qa_note', { request });
}

export async function returnRecipe(path: string, body: string, improved: boolean): Promise<void> {
    await invoke('fusen_return_recipe', { path, body, improved });
}
