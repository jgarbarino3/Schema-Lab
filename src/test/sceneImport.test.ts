import { describe, expect, it } from 'vitest'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import {
  formatSceneImportNotice,
  importSceneDocument,
} from '../domain/sceneImport'
import { createEmptyScene } from '../domain/serialization'
import {
  convertSceneToOpticalTable,
  surfaceLocalToWorld,
} from '../domain/workspace'
import { SCENE_DOCUMENT_VERSION } from '../domain/types'

function createMirrorComponent(overrides?: {
  anchorMm?: { x: number; y: number }
  hostSurfaceId?: string
  id?: string
}) {
  const variantId = getComponentDefinition('mirror').defaultVariantId

  return {
    id: overrides?.id ?? 'mirror-1',
    type: 'mirror' as const,
    label: 'Mirror 1',
    variantId,
    anchorMm: overrides?.anchorMm ?? { x: 110, y: 137.5 },
    hostSurfaceId: overrides?.hostSurfaceId,
    rotationQuarterTurns: 0 as const,
    config: createDefaultComponentConfig('mirror', variantId),
  }
}

describe('scene import', () => {
  it('imports shorthand workspace JSON by wrapping a full scene document', () => {
    const scene = createEmptyScene()
    const rawJson = JSON.stringify({
      workspace: scene.workspace,
    })

    const result = importSceneDocument(rawJson)

    expect(result.scene.kind).toBe('schema-lab.scene')
    expect(result.scene.version).toBe(SCENE_DOCUMENT_VERSION)
    expect(result.diagnostics.usedFallback).toBe(true)
    expect(result.diagnostics.wrapperInjected).toBe(true)
    expect(result.diagnostics.versionCoerced).toBe(true)
  })

  it('coerces unsupported explicit scene versions to the current schema', () => {
    const scene = createEmptyScene()
    const rawJson = JSON.stringify({
      ...scene,
      version: 99,
    })

    const result = importSceneDocument(rawJson)

    expect(result.scene.version).toBe(SCENE_DOCUMENT_VERSION)
    expect(result.diagnostics.usedFallback).toBe(true)
    expect(result.diagnostics.versionCoerced).toBe(true)
  })

  it('normalizes component host surfaces for single-breadboard scenes', () => {
    const scene = createEmptyScene()
    scene.components = [
      createMirrorComponent({
        hostSurfaceId: 'optical-table',
      }),
    ]

    const result = importSceneDocument(JSON.stringify(scene))

    expect(result.scene.components[0]?.hostSurfaceId).toBe('single-breadboard')
    expect(result.diagnostics.hostSurfaceFixedCount).toBe(1)
  })

  it('repairs invalid optical-table host ids and converts local anchors to world space', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    const breadboardId = scene.workspace.breadboards[0]?.id

    if (!breadboardId) {
      throw new Error('expected at least one breadboard')
    }

    const localAnchorMm = { x: 100, y: 100 }
    const expectedWorldAnchorMm = surfaceLocalToWorld(
      scene,
      breadboardId,
      localAnchorMm,
    )

    scene.components = [
      createMirrorComponent({
        anchorMm: localAnchorMm,
        hostSurfaceId: 'unknown-breadboard',
      }),
    ]

    const result = importSceneDocument(JSON.stringify(scene))

    expect(result.scene.components[0]?.hostSurfaceId).toBe(breadboardId)
    expect(result.scene.components[0]?.anchorMm).toEqual(expectedWorldAnchorMm)
    expect(result.diagnostics.hostSurfaceFixedCount).toBe(1)
    expect(result.diagnostics.localAnchorConvertedCount).toBe(1)
  })

  it('formats mode-switch notices for users', () => {
    const importedScene = convertSceneToOpticalTable(createEmptyScene())
    const result = importSceneDocument(JSON.stringify(importedScene))

    const notice = formatSceneImportNotice({
      currentWorkspaceKind: 'single-breadboard',
      result,
    })

    expect(notice).toContain('switched to table view')
  })
})
