export type HideableWindow = {
    hide: () => Promise<void>;
};

export async function hideReturnedCrystalWindow(window: HideableWindow): Promise<void> {
    await window.hide();
}
