import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isRestricted, unlocked } from '../src/lib/access'
import { defaultSettings } from '../electron/db'
import type { Settings } from '../shared/types'

const ROLES: Settings['role'][] = ['admin', 'director', 'replay', 'graphics']
const APP = readFileSync(path.resolve(import.meta.dirname, '../src/App.tsx'), 'utf8')

/**
 * Student mode and the non-admin roles hide the Settings page, which is the only
 * place to switch them off. A user who picks one must never be stranded.
 */
describe('restricted views are always escapable', () => {
  it('ships unrestricted', () => {
    const d = defaultSettings()
    expect(d.studentMode).toBe(false)
    expect(d.role).toBe('admin')
    expect(isRestricted(d)).toBe(false)
  })

  it('flags every state that hides Settings', () => {
    for (const role of ROLES) {
      for (const studentMode of [true, false]) {
        const s = { ...defaultSettings(), role, studentMode }
        // Settings is hidden by student mode, or by any role other than admin.
        const hidden = studentMode || role !== 'admin'
        expect(isRestricted(s), `role=${role} student=${studentMode}`).toBe(hidden)
      }
    }
  })

  it('unlocking restores full access from any restricted state', () => {
    for (const role of ROLES) {
      for (const studentMode of [true, false]) {
        const before = { ...defaultSettings(), role, studentMode }
        expect(isRestricted(unlocked(before)), `from role=${role} student=${studentMode}`).toBe(false)
      }
    }
  })

  it('renders the escape control whenever access is restricted', () => {
    // The control is gated on isRestricted and lives outside the filtered nav,
    // so it cannot be hidden by the same rule it exists to undo.
    expect(APP).toMatch(/function AccessLock\(\)/)
    expect(APP).toMatch(/if \(!isRestricted\(s\.settings\)\) return null/)
    const navEnd = APP.indexOf('<AccessLock />')
    expect(navEnd).toBeGreaterThan(-1)
    // It must not be inside the PAGES list that student mode filters.
    expect(APP.slice(0, navEnd)).not.toMatch(/advanced: true[^]*<AccessLock/)
  })

  it('only the two intended pages are marked advanced', () => {
    const advanced = [...APP.matchAll(/\{ id: '(\w+)', label: '[^']+', advanced: true \}/g)].map((m) => m[1])
    expect(advanced.sort()).toEqual(['monitoring', 'settings'])
  })
})

/**
 * Electron derives the config directory from the package name, so renaming the
 * project moves it. An existing installation's venues, mappings, checklists and
 * game state must not be stranded in the old folder.
 */
describe('rebrand does not strand an existing configuration', () => {
  const main = readFileSync(path.resolve(import.meta.dirname, '../electron/main.ts'), 'utf8')

  it('adopts the previous config directory on first run', () => {
    expect(main).toMatch(/function adoptPreviousConfig/)
    expect(main).toMatch(/'school-broadcast-control'/)
    expect(main).toMatch(/adoptPreviousConfig\(userData\)/)
  })

  it('only copies when the new directory is empty, so it cannot clobber a live config', () => {
    const fn = /function adoptPreviousConfig[\s\S]*?\n\}/.exec(main)?.[0] ?? ''
    expect(fn).toMatch(/if \(existsSync\(path\.join\(userData, 'sbc\.db'\)\)\) return/)
  })

  it('brings the WAL and shared-memory files with the database', () => {
    const fn = /function adoptPreviousConfig[\s\S]*?\n\}/.exec(main)?.[0] ?? ''
    expect(fn).toMatch(/startsWith\('sbc\.db'\)/)
  })
})

describe('branding is consistent', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const files = ['package.json', 'electron-builder.yml', 'README.md', 'index.html', 'src/App.tsx']

  it('has no "School Broadcast Control" left in shipped files', () => {
    for (const f of files) {
      expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/School Broadcast Control/)
    }
  })

  it('names and identifiers agree', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    const builder = readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(pkg.name).toBe('sports-broadcast-control')
    expect(builder).toMatch(/appId: net\.sportsbroadcast\.control/)
    expect(builder).toMatch(/productName: Sports Broadcast Control/)
  })
})
