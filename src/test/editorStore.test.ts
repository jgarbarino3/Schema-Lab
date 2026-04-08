import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import { worldToScreen } from '../domain/geometry'
import { createEmptyScene } from '../domain/serialization'
import { OPTICAL_TABLE_SURFACE_ID } from '../domain/types'
import {
  convertSceneToOpticalTable,
  createBreadboardInstance,
  getBreadboardInstance,
  getBreadboardWorldBoundsMm,
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

  it('defaults optical-table laser sources to the compact table-mounted variant', () => {
    const store = useEditorStore.getState()

    store.selectBreadboard('breadboard-2')
    store.addComponent('laser-source')

    const pendingPlacement = useEditorStore.getState().interaction.pendingPlacement

    expect(pendingPlacement?.draft.variantId).toBe('compact-table-source')
    expect(pendingPlacement?.draft.hostSurfaceId).toBe(OPTICAL_TABLE_SURFACE_ID)
    expect(pendingPlacement?.draft.config.source?.firstTargetComponentId).toBeUndefined()
  })

  it('moves hosted components together with a dragged breadboard', () => {
    const scene = useEditorStore.getState().scene

    useEditorStore.getState().loadScene(
      {
        ...scene,
        components: [
          {
            id: 'mirror-on-board',
            type: 'mirror',
            label: 'Mirror 1',
            variantId: mirrorVariantId,
            anchorMm: { x: 2362.5, y: 612.5 },
            hostSurfaceId: 'breadboard-2',
            rotationQuarterTurns: 0,
            config: createDefaultComponentConfig('mirror', mirrorVariantId),
          },
        ],
      },
      { history: 'reset' },
    )

    const store = useEditorStore.getState()

    store.beginBreadboardDrag('breadboard-2')
    store.updateBreadboardDrag('breadboard-2', { x: 2310, y: 560 })
    store.commitBreadboardDrag('breadboard-2', { x: 2310, y: 560 })

    expect(useEditorStore.getState().scene.components[0]?.anchorMm).toEqual({
      x: 2392.5,
      y: 652.5,
    })

    const nextScene = useEditorStore.getState().scene
    if (nextScene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    expect(
      nextScene.workspace.breadboards.find((breadboard) => breadboard.id === 'breadboard-2')
        ?.anchorMm,
    ).toEqual({
      x: 2310,
      y: 560,
    })
  })

  it('remembers the focused breadboard across board-focus and table-view toggles', () => {
    const store = useEditorStore.getState()

    store.selectBreadboard('breadboard-2')
    store.setWorkspaceViewMode('board-focus')

    expect(useEditorStore.getState().interaction.focusedBreadboardId).toBe(
      'breadboard-2',
    )
    expect(useEditorStore.getState().interaction.activeHostSurfaceId).toBe(
      'breadboard-2',
    )

    store.setWorkspaceViewMode('table-view')
    expect(useEditorStore.getState().interaction.workspaceViewMode).toBe('table-view')

    store.setWorkspaceViewMode('board-focus')
    expect(useEditorStore.getState().interaction.focusedBreadboardId).toBe(
      'breadboard-2',
    )
    expect(useEditorStore.getState().interaction.activeHostSurfaceId).toBe(
      'breadboard-2',
    )
  })

  it('uses a top-biased reset view for both board focus and table view', () => {
    const store = useEditorStore.getState()

    store.setViewportSize({ width: 1400, height: 900 })
    store.selectBreadboard('breadboard-2')
    store.setWorkspaceViewMode('board-focus')
    store.resetViewport()

    const boardFocusViewport = useEditorStore.getState().viewport
    const breadboard = getBreadboardInstance(useEditorStore.getState().scene, 'breadboard-2')

    if (!breadboard) {
      throw new Error('expected breadboard-2 to exist')
    }

    const boardBounds = getBreadboardWorldBoundsMm(
      breadboard.model,
      breadboard.anchorMm,
      breadboard.rotationQuarterTurns,
    )
    const boardTopPx = worldToScreen({ x: boardBounds.x, y: boardBounds.y }, boardFocusViewport).y

    expect(boardTopPx).toBeGreaterThan(0)
    expect(boardTopPx).toBeLessThan(90)

    store.setWorkspaceViewMode('table-view')
    store.resetViewport()

    const tableViewport = useEditorStore.getState().viewport
    const tableTopPx = worldToScreen({ x: 0, y: 0 }, tableViewport).y

    expect(tableTopPx).toBeGreaterThan(0)
    expect(tableTopPx).toBeLessThan(90)
  })
})

describe('editor store annotations', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates and edits a text annotation', () => {
    const store = useEditorStore.getState()

    store.addTextAnnotationAt({ x: 42, y: 56 })

    const selectionAfterAdd = useEditorStore.getState().selection
    const selectedAnnotation =
      selectionAfterAdd.type === 'annotation'
        ? useEditorStore
            .getState()
            .scene.annotations.find(
              (annotation) => annotation.id === selectionAfterAdd.annotationId,
            )
        : undefined

    expect(selectedAnnotation?.kind).toBe('text')
    expect(useEditorStore.getState().interaction.activeTool).toBe('select')
    expect(useEditorStore.getState().interaction.editingTextAnnotationId).toBe(
      selectedAnnotation?.id,
    )

    store.finishTextAnnotationEditing('Pump arm note')

    const textAnnotation = useEditorStore.getState().scene.annotations[0]
    expect(textAnnotation).toMatchObject({
      kind: 'text',
      text: 'Pump arm note',
    })

    store.updateSelectedTextStyle({
      bold: true,
      underline: true,
    })

    expect(useEditorStore.getState().scene.annotations[0]).toMatchObject({
      kind: 'text',
      style: expect.objectContaining({
        bold: true,
        underline: true,
      }),
    })
  })

  it('creates, resizes, duplicates, and deletes a shape annotation', () => {
    const store = useEditorStore.getState()

    store.setShapeToolKind('ellipse')
    store.addShapeAnnotationAt({ x: 60, y: 72 })

    expect(useEditorStore.getState().scene.annotations[0]).toMatchObject({
      kind: 'shape',
      shapeKind: 'ellipse',
    })
    expect(useEditorStore.getState().interaction.activeTool).toBe('select')

    store.updateSelectedShapeAnnotation({
      boundsMm: {
        width: 64,
        height: 28,
      },
    })

    expect(useEditorStore.getState().scene.annotations[0]).toMatchObject({
      kind: 'shape',
      boundsMm: expect.objectContaining({
        width: 64,
        height: 28,
      }),
    })

    store.duplicateSelectedAnnotation()
    expect(useEditorStore.getState().scene.annotations).toHaveLength(2)

    store.deleteSelectedAnnotation()
    expect(useEditorStore.getState().scene.annotations).toHaveLength(1)
  })
})

describe('editor store fresh optical table', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  it('can create a fresh empty optical table workspace', () => {
    const store = useEditorStore.getState()

    store.createFreshOpticalTable()

    expect(useEditorStore.getState().scene.workspace.kind).toBe('optical-table')
    const nextScene = useEditorStore.getState().scene

    if (nextScene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }
    expect(nextScene.workspace.breadboards).toHaveLength(0)
    expect(nextScene.components).toHaveLength(0)
    expect(useEditorStore.getState().interaction.workspaceViewMode).toBe('table-view')
  })
})
