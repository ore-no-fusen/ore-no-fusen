import { invoke } from '@tauri-apps/api/core';
import type { CrystalFormats } from '../utils/crystalFormatConfig';

export async function getCrystalFormatsRaw(): Promise<string | null> {
    return await invoke<string | null>('fusen_get_crystal_formats');
}

export async function saveCrystalFormats(formats: CrystalFormats): Promise<void> {
    await invoke('fusen_save_crystal_formats', { json: JSON.stringify(formats) });
}
