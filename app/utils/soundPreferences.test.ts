import { describe, expect, it } from 'vitest'
import { normalizeSoundPreset, soundSettingKey, type SoundScene } from './soundPreferences'

describe('sound preferences', () => {
  it('keeps supported choices and falls back to default for unknown values', () => {
    expect(normalizeSoundPreset('silent')).toBe('silent')
    expect(normalizeSoundPreset('alternate')).toBe('alternate')
    expect(normalizeSoundPreset('not-a-sound')).toBe('standard')
  })

  it('maps every daily PC scene to its own persisted setting', () => {
    const scenes: SoundScene[] = ['create', 'duplicate', 'archive', 'delete', 'checkbox', 'pin', 'unpin', 'alarm']
    expect(scenes.map(soundSettingKey)).toEqual([
      'sound_create', 'sound_duplicate', 'sound_archive', 'sound_delete', 'sound_checkbox', 'sound_pin', 'sound_unpin', 'sound_alarm',
    ])
  })
})
