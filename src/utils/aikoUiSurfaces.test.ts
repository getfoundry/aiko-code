import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import { optionForPermissionSaveDestination } from '../components/permissions/rules/AddPermissionRules.tsx'
import { isaikoSettingsPath } from './permissions/filesystem.ts'
import { getValidationTip } from './settings/validationTips.ts'

describe('aiko-code settings path surfaces', () => {
  test('isaikoSettingsPath recognizes project .aiko-code settings files', () => {
    expect(
      isaikoSettingsPath(
        join(process.cwd(), '.aiko-code', 'settings.json'),
      ),
    ).toBe(true)

    expect(
      isaikoSettingsPath(
        join(process.cwd(), '.aiko-code', 'settings.local.json'),
      ),
    ).toBe(true)
  })

  test('permission save destinations point user settings to ~/.aiko-code', () => {
    expect(optionForPermissionSaveDestination('userSettings')).toEqual({
      label: 'User settings',
      description: 'Saved in ~/.aiko/settings.json',
      value: 'userSettings',
    })
  })

  test('permission save destinations point project settings to .aiko-code', () => {
    expect(optionForPermissionSaveDestination('projectSettings')).toEqual({
      label: 'Project settings',
      description: 'Checked in at .aiko/settings.json',
      value: 'projectSettings',
    })

    expect(optionForPermissionSaveDestination('localSettings')).toEqual({
      label: 'Project settings (local)',
      description: 'Saved in .aiko/settings.local.json',
      value: 'localSettings',
    })
  })
})

describe('aiko-code validation tips', () => {
  test('permissions.defaultMode invalid value keeps suggestion but no aiko docs link', () => {
    const tip = getValidationTip({
      path: 'permissions.defaultMode',
      code: 'invalid_value',
      enumValues: [
        'acceptEdits',
        'bypassPermissions',
        'default',
        'dontAsk',
        'plan',
      ],
    })

    expect(tip).toEqual({
      suggestion:
        'Valid modes: "acceptEdits" (ask before file changes), "plan" (analysis only), "bypassPermissions" (auto-accept all), or "default" (standard behavior)',
    })
  })
})
