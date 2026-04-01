import { describe, expect, it } from 'vitest'
import {
  createEmptyScene,
  parseSceneDocument,
  serializeSceneDocument,
} from '../domain/serialization'

describe('scene serialization', () => {
  it('round-trips a scene document through JSON', () => {
    const scene = createEmptyScene()

    scene.components.push({
      id: 'laser-1',
      type: 'laser-source',
      label: 'Seed Laser',
      anchorMm: { x: 187.5, y: 162.5 },
      rotationQuarterTurns: 0,
    })

    expect(parseSceneDocument(serializeSceneDocument(scene))).toEqual(scene)
  })

  it('rejects unsupported scene versions', () => {
    const scene = createEmptyScene()
    const invalidJson = JSON.stringify({
      ...scene,
      version: 99,
    })

    expect(() => parseSceneDocument(invalidJson)).toThrow(
      'Unsupported scene version: 99.',
    )
  })
})
