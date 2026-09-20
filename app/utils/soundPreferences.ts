export const SOUND_PRESETS = ['standard', 'soft', 'modern', 'wood', 'typewriter', 'alternate', 'silent'] as const
export type SoundPreset = typeof SOUND_PRESETS[number]
export type SoundScene = 'create' | 'duplicate' | 'archive' | 'delete' | 'checkbox' | 'pin' | 'unpin' | 'alarm'

export function normalizeSoundPreset(value: unknown): SoundPreset {
  return SOUND_PRESETS.includes(value as SoundPreset) ? value as SoundPreset : 'standard'
}

export function soundSettingKey(scene: SoundScene): `sound_${SoundScene}` {
  return `sound_${scene}` as `sound_${SoundScene}`
}
