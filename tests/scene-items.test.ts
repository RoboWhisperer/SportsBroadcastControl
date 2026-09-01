import { describe, expect, it } from 'vitest'
import { mapSceneItem, type RawSceneItem } from '../electron/services/obs'

/**
 * Payloads captured verbatim from OBS Studio 30.2.3 / obs-websocket 5 answering
 * GetSceneItemList. A scene nested inside another scene arrives here looking
 * almost exactly like a source, which is what made the app list scenes as
 * sources.
 */
const REAL = {
  input: {
    sceneItemId: 1,
    sourceName: 'Court Wide',
    sourceType: 'OBS_SOURCE_TYPE_INPUT',
    inputKind: 'color_source_v3',
    isGroup: null,
    sceneItemEnabled: true,
  } satisfies RawSceneItem,
  nestedScene: {
    sceneItemId: 1,
    sourceName: 'CAM 1',
    sourceType: 'OBS_SOURCE_TYPE_SCENE',
    inputKind: null,
    isGroup: false,
    sceneItemEnabled: true,
  } satisfies RawSceneItem,
}

describe('scene item classification', () => {
  it('reads a real source as an input, with its kind', () => {
    expect(mapSceneItem(REAL.input)).toEqual({
      id: 1,
      sourceName: 'Court Wide',
      enabled: true,
      type: 'input',
      kind: 'color_source_v3',
    })
  })

  it('reads a nested scene as a scene, not as a source', () => {
    const item = mapSceneItem(REAL.nestedScene)
    expect(item.type).toBe('scene')
    expect(item.kind).toBe('')
    // The regression: this used to be indistinguishable from an input.
    expect(item.type).not.toBe('input')
  })

  it('reads a group as a group and tags its expanded children', () => {
    // isGroup is what OBS sets; the shape otherwise matches the captures above.
    const group: RawSceneItem = { sceneItemId: 7, sourceName: 'Lower Thirds', sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: true, sceneItemEnabled: true }
    expect(mapSceneItem(group).type).toBe('group')
    const child = mapSceneItem({ ...REAL.input, sceneItemId: 8 }, 'Lower Thirds')
    expect(child).toMatchObject({ type: 'input', group: 'Lower Thirds' })
  })

  it('defaults to input when OBS omits the type, rather than guessing scene', () => {
    expect(mapSceneItem({ sceneItemId: 1, sourceName: 'X', sceneItemEnabled: false }).type).toBe('input')
  })
})

describe('the mock OBS stays internally consistent', () => {
  it('never puts a scene item in a scene unless it is an input it has or one of its scenes', async () => {
    const { MockObs } = await import('../electron/services/obs')
    const obs = new MockObs({ onStatus: () => {}, onEvent: () => {}, log: () => {} })
    await obs.connect()
    const inputs = (await obs.getInputs()).map((i) => i.name)
    const scenes = obs.getStatus().scenes

    for (const scene of scenes) {
      for (const item of await obs.getSceneItems(scene)) {
        const known = item.type === 'scene' ? scenes.includes(item.sourceName) : inputs.includes(item.sourceName)
        expect(known, `${scene} -> ${item.sourceName} (${item.type})`).toBe(true)
        // The old mock invented "<SCENE> source" entries; nothing may be named after its scene.
        expect(item.sourceName).not.toBe(`${scene} source`)
      }
    }
  })
})
