import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import { createEmptyScene } from '../domain/serialization'
import { OPTICAL_TABLE_SURFACE_ID } from '../domain/types'
import {
  convertSceneToOpticalTable,
  createBreadboardInstance,
} from '../domain/workspace'
import { useEditorStore } from '../state/editorStore'

describe('editor store pending placement', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('arms pending placement before committing a component to the scene', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')

    expect(useEditorStore.getState().scene.components).toHaveLength(0)
    expect(useEditorStore.getState().interaction.pendingPlacement?.draft.label).toBe(
      'Mirror 1',
    )

    useEditorStore.getState().commitPendingPlacement({ x: 112.5, y: 112.5 })

    expect(useEditorStore.getState().scene.components).toHaveLength(1)
    expect(useEditorStore.getState().scene.components[0]?.label).toBe('Mirror 1')
    expect(useEditorStore.getState().interaction.pendingPlacement).toBeUndefined()
  })

  it('auto-numbers duplicates by family instead of using copy labels', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })

    const firstMirror = useEditorStore.getState().scene.components[0]!
    useEditorStore.getState().selectComponent(firstMirror.id)
    useEditorStore.getState().duplicateSelectedComponent()

    expect(
      useEditorStore.getState().scene.components.map((component) => component.label),
    ).toEqual(['Mirror 1', 'Mirror 2'])
  })

  it('cancels an armed pending placement cleanly', () => {
    const store = useEditorStore.getState()

    store.addComponent('lens')
    expect(useEditorStore.getState().interaction.pendingPlacement).toBeDefined()

    useEditorStore.getState().cancelActiveInteraction()

    expect(useEditorStore.getState().interaction.pendingPlacement).toBeUndefined()
    expect(useEditorStore.getState().scene.components).toHaveLength(0)
  })
})

describe('editor store scene history', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('undoes and redoes committed scene placement changes', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })

    const placedMirror = useEditorStore.getState().scene.components[0]
    expect(placedMirror?.type).toBe('mirror')
    expect(useEditorStore.getState().canUndo).toBe(true)
    expect(useEditorStore.getState().canRedo).toBe(false)

    store.undo()

    expect(useEditorStore.getState().scene.components).toHaveLength(0)
    expect(useEditorStore.getState().canRedo).toBe(true)

    store.redo()

    expect(useEditorStore.getState().scene.components).toHaveLength(1)
    expect(useEditorStore.getState().scene.components[0]?.id).toBe(placedMirror?.id)
    expect(useEditorStore.getState().canUndo).toBe(true)
  })

  it('clears the redo stack after a new edit is committed', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })
    store.undo()

    expect(useEditorStore.getState().canRedo).toBe(true)

    store.addComponent('lens')
    store.commitPendingPlacement({ x: 137.5, y: 112.5 })

    expect(useEditorStore.getState().scene.components.map((component) => component.type)).toEqual([
      'lens',
    ])
    expect(useEditorStore.getState().canRedo).toBe(false)

    store.redo()

    expect(useEditorStore.getState().scene.components.map((component) => component.type)).toEqual([
      'lens',
    ])
  })

  it('coalesces repeated inspector edits into a single undo step', () => {
    const dateNowSpy = vi.spyOn(Date, 'now')
    const store = useEditorStore.getState()

    dateNowSpy.mockReturnValue(1000)
    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })

    const mirrorId = useEditorStore.getState().scene.components[0]!.id
    store.selectComponent(mirrorId)

    dateNowSpy.mockReturnValue(1200)
    store.updateSelectedComponent({ label: 'Pump Mirror' })
    dateNowSpy.mockReturnValue(1400)
    store.updateSelectedComponent({ label: 'Final Pump Mirror' })

    expect(useEditorStore.getState().scene.components[0]?.label).toBe('Final Pump Mirror')

    store.undo()

    expect(useEditorStore.getState().scene.components[0]?.label).toBe('Mirror 1')
  })
})

describe('editor store optical table placement', () => {
  const mirrorVariantId = getComponentDefinition('mirror').defaultVariantId

  beforeEach(() => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    scene.workspace.breadboards.push(
      createBreadboardInstance({
        id: 'breadboard-2',
        label: 'Breadboard 2',
        model: createBreadboardFromPreset('metric-300-square'),
        anchorMm: { x: 2280, y: 520 },
      }),
    )

    useEditorStore.getState().loadScene(scene, { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('places an armed component onto the breadboard under the drop point', () => {
    const store = useEditorStore.getState()

    store.selectOpticalTable()
    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 2355, y: 595 })

    const placedMirror = useEditorStore.getState().scene.components[0]

    expect(placedMirror?.hostSurfaceId).toBe('breadboard-2')
    expect(useEditorStore.getState().interaction.pendingPlacement).toBeUndefined()
  })

  it('retargets component drags across table and breadboard surfaces', () => {
    const scene = useEditorStore.getState().scene

    useEditorStore.getState().loadScene(
      {
        ...scene,
        components: [
          {
            id: 'mirror-1',
            type: 'mirror',
            label: 'Mirror 1',
            variantId: mirrorVariantId,
            anchorMm: { x: 420, y: 360 },
            hostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
            rotationQuarterTurns: 0,
            config: createDefaultComponentConfig('mirror', mirrorVariantId),
          },
        ],
      },
      { history: 'reset' },
    )

    const store = useEditorStore.getState()

    store.beginComponentDrag('mirror-1')
    store.updateComponentDrag('mirror-1', { x: 2355, y: 595 })
    store.commitComponentDrag('mirror-1', { x: 2355, y: 595 })

    expect(useEditorStore.getState().scene.components[0]?.hostSurfaceId).toBe(
      'breadboard-2',
    )

    useEditorStore.getState().beginComponentDrag('mirror-1')
    useEditorStore.getState().updateComponentDrag('mirror-1', { x: 420, y: 360 })
    useEditorStore.getState().commitComponentDrag('mirror-1', { x: 420, y: 360 })

    expect(useEditorStore.getState().scene.components[0]?.hostSurfaceId).toBe(
      OPTICAL_TABLE_SURFACE_ID,
    )
  })

  it('retargets an armed placement from the host surface control without canceling it', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    expect(useEditorStore.getState().interaction.pendingPlacement).toBeDefined()

    store.setActiveHostSurfaceId('breadboard-2')

    const pendingPlacement = useEditorStore.getState().interaction.pendingPlacement

    expect(pendingPlacement).toBeDefined()
    expect(pendingPlacement?.draft.hostSurfaceId).toBe('breadboard-2')
    expect(useEditorStore.getState().interaction.activeHostSurfaceId).toBe(
      'breadboard-2',
    )
    expect(pendingPlacement?.candidateAnchorMm.x).toBeGreaterThan(2280)
    expect(pendingPlacement?.candidateAnchorMm.y).toBeGreaterThan(520)
  })
})
