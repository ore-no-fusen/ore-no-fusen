export type RecipeDraftRequest = {
    path: string;
    revision: number;
};

export function nextRecipeDraftRequest(
    current: RecipeDraftRequest,
    path: string,
): RecipeDraftRequest {
    return { path, revision: current.revision + 1 };
}
