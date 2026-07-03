import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import { getNearestBoardCenterHole } from '../domain/breadboard'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import { worldToScreen } from '../domain/geometry'
import { createEmptyScene } from '../domain/serialization'
import { OPTICAL_TABLE_SURFACE_ID, SINGLE_BREADBOARD_SURFACE_ID } from '../domain/types'
import {
  convertSceneToOpticalTable,
  createBreadboardInstance,
  getBreadboardInstance,
  getBreadboardWorldBoundsMm,
  surfaceLocalToWorld,
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
      'M1',
    )

    useEditorStore.getState().commitPendingPlacement({ x: 112.5, y: 112.5 })

    expect(useEditorStore.getState().scene.components).toHaveLength(1)
    expect(useEditorStore.getState().scene.components[0]?.label).toBe('M1')
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
    ).toEqual(['M1', 'M2'])
  })

  it('uses compact schematic labels for other optics', () => {
    const store = useEditorStore.getState()

    store.addComponent('lens')
    expect(useEditorStore.getState().interaction.pendingPlacement?.draft.label).toBe('L1')
    store.cancelActiveInteraction()

    store.addComponent('beamsplitter')
    expect(useEditorStore.getState().interaction.pendingPlacement?.draft.label).toBe('BS1')
  })

  it('cancels an armed pending placement cleanly', () => {
    const store = useEditorStore.getState()

    store.addComponent('lens')
    expect(useEditorStore.getState().interaction.pendingPlacement).toBeDefined()

    useEditorStore.getState().cancelActiveInteraction()

    expect(useEditorStore.getState().interaction.pendingPlacement).toBeUndefined()
    expect(useEditorStore.getState().scene.components).toHaveLength(0)
  })

  it('persists selected simple icon overrides onto pending and placed components', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    store.setSelectedSimpleIconStyleOverride('classic')

    expect(
      useEditorStore.getState().interaction.pendingPlacement?.draft.simpleIconStyleOverride,
    ).toBe('classic')

    store.commitPendingPlacement({ x: 112.5, y: 112.5 })

    const mirrorId = useEditorStore.getState().scene.components[0]!.id
    store.selectComponent(mirrorId)
    store.setSelectedSimpleIconStyleOverride(undefined)

    expect(useEditorStore.getState().scene.components[0]?.simpleIconStyleOverride).toBeUndefined()
  })

  it('keeps per-component simple icon overrides scoped to the selected component', () => {
    const store = useEditorStore.getState()

    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })
    store.addComponent('mirror', 'flip-mirror')
    store.commitPendingPlacement({ x: 162.5, y: 112.5 })

    const [firstMirror, secondMirror] = useEditorStore.getState().scene.components

    if (!firstMirror || !secondMirror) {
      throw new Error('expected two mirrors to be placed')
    }

    store.selectComponent(firstMirror.id)
    store.setSelectedSimpleIconStyleOverride('classic')

    expect(useEditorStore.getState().scene.components[0]?.simpleIconStyleOverride).toBe(
      'classic',
    )
    expect(useEditorStore.getState().scene.components[1]?.simpleIconStyleOverride).toBeUndefined()

    store.selectComponent(secondMirror.id)
    store.setSelectedSimpleIconStyleOverride('enhanced')

    expect(useEditorStore.getState().scene.components[0]?.simpleIconStyleOverride).toBe(
      'classic',
    )
    expect(useEditorStore.getState().scene.components[1]?.simpleIconStyleOverride).toBe(
      'enhanced',
    )
  })

  it('sets and clears interaction notices explicitly', () => {
    const store = useEditorStore.getState()

    store.setNotice('Loaded an optical-table scene and switched to table view.')
    expect(useEditorStore.getState().interaction.notice).toBe(
      'Loaded an optical-table scene and switched to table view.',
    )

    store.clearNotice()
    expect(useEditorStore.getState().interaction.notice).toBeUndefined()
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

    expect(useEditorStore.getState().scene.components[0]?.label).toBe('M1')
  })
})

describe('editor store post-mounted configuration', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates post holder diameter for attenuators', () => {
    const store = useEditorStore.getState()

    store.addComponent('attenuator', 'variable-nd-vertical')
    store.commitPendingPlacement({ x: 112.5, y: 112.5 })

    const attenuator = useEditorStore.getState().scene.components[0]
    expect(attenuator?.type).toBe('attenuator')
    expect(attenuator?.config.postHolderDiameterMm).toBeUndefined()

    if (!attenuator) {
      throw new Error('expected attenuator to be placed')
    }

    store.selectComponent(attenuator.id)
    store.updateSelectedPostHolderDiameter(26)

    expect(useEditorStore.getState().scene.components[0]?.config.postHolderDiameterMm).toBe(26)
  })
})

describe('editor store single breadboard viewport', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recomputes the default framing when the real canvas size becomes available', () => {
    const store = useEditorStore.getState()

    store.setViewportSize({ width: 1400, height: 900 })

    const viewport = useEditorStore.getState().viewport
    const scene = useEditorStore.getState().scene

    if (scene.workspace.kind !== 'single-breadboard') {
      throw new Error('expected single-breadboard workspace')
    }

    const boardBounds = getBreadboardWorldBoundsMm(scene.workspace.breadboard)
    const boardTopPx = worldToScreen({ x: boardBounds.x, y: boardBounds.y }, viewport).y

    expect(viewport.zoomPxPerMm).toBeCloseTo(1.67, 5)
    expect(boardTopPx).toBeGreaterThan(95)
    expect(boardTopPx).toBeLessThan(97)
  })
})

describe('editor store highlight drag', () => {
  const mirrorVariantId = getComponentDefinition('mirror').defaultVariantId

  beforeEach(() => {
    useEditorStore.getState().loadScene(
      {
        ...createEmptyScene(),
        components: [
          {
            id: 'mirror-1',
            type: 'mirror',
            label: 'Mirror 1',
            variantId: mirrorVariantId,
            anchorMm: { x: 112.5, y: 112.5 },
            rotationQuarterTurns: 0,
            config: createDefaultComponentConfig('mirror', mirrorVariantId),
          },
          {
            id: 'mirror-2',
            type: 'mirror',
            label: 'Mirror 2',
            variantId: mirrorVariantId,
            anchorMm: { x: 162.5, y: 112.5 },
            rotationQuarterTurns: 0,
            config: createDefaultComponentConfig('mirror', mirrorVariantId),
          },
        ],
      },
      { history: 'reset' },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves all highlighted components together when dragging one of them', () => {
    const store = useEditorStore.getState()

    store.setActiveTool('highlight')
    store.commitHighlightSelectionBounds({ x: 80, y: 80 }, { x: 200, y: 150 })

    expect(useEditorStore.getState().interaction.highlightSelection?.componentIds).toEqual([
      'mirror-1',
      'mirror-2',
    ])

    store.beginComponentDrag('mirror-1')
    store.updateComponentDrag('mirror-1', { x: 212.5, y: 212.5 })
    store.commitComponentDrag('mirror-1', { x: 212.5, y: 212.5 })

    expect(useEditorStore.getState().scene.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mirror-1',
          anchorMm: { x: 212.5, y: 212.5 },
        }),
        expect.objectContaining({
          id: 'mirror-2',
          anchorMm: { x: 262.5, y: 212.5 },
        }),
      ]),
    )
    expect(useEditorStore.getState().interaction.highlightSelection?.boundsMm).toMatchObject({
      x: 196.5,
      y: 196.5,
      width: 82,
      height: 32,
    })
  })
})

describe('editor store mounted stage attachments', () => {
  const stageVariantId = getComponentDefinition('sample-holder').defaultVariantId
  const delayStageVariantId = 'pi-m-112-1dg1'
  const irisVariantId = getComponentDefinition('iris').defaultVariantId

  function createBareStageScene() {
    return {
      ...createEmptyScene(),
      components: [
        {
          id: 'stage-1',
          type: 'sample-holder' as const,
          label: 'Sample / Stage 1',
          variantId: stageVariantId,
          anchorMm: { x: 150, y: 150 },
          rotationQuarterTurns: 0 as const,
          config: createDefaultComponentConfig('sample-holder', stageVariantId),
        },
      ],
    }
  }

  function createMountedStageScene() {
    const baseScene = createBareStageScene()

    return {
      ...baseScene,
      components: [
        ...baseScene.components,
        {
          id: 'iris-1',
          type: 'iris' as const,
          label: 'Iris 1',
          variantId: irisVariantId,
          anchorMm: { x: 0, y: 0 },
          hostSurfaceId: SINGLE_BREADBOARD_SURFACE_ID,
          rotationQuarterTurns: 0 as const,
          attachment: {
            parentComponentId: 'stage-1',
            parentMountSiteId: 'optic-seat',
            localAnchorMm: { x: 15, y: 0 },
            localRotationQuarterTurns: 0 as const,
          },
          config: createDefaultComponentConfig('iris', irisVariantId),
        },
      ],
    }
  }

  beforeEach(() => {
    useEditorStore.getState().loadScene(createMountedStageScene(), { history: 'reset' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves attached optics once when a highlighted stage is dragged', () => {
    const store = useEditorStore.getState()

    store.setActiveTool('highlight')
    store.commitHighlightSelectionBounds({ x: 120, y: 120 }, { x: 180, y: 180 })
    store.beginComponentDrag('stage-1')
    store.updateComponentDrag('stage-1', { x: 200, y: 210 })
    store.commitComponentDrag('stage-1', { x: 200, y: 210 })

    const movedStage = useEditorStore.getState().scene.components.find((component) => component.id === 'stage-1')
    const movedIris = useEditorStore.getState().scene.components.find((component) => component.id === 'iris-1')

    expect(movedStage?.anchorMm).toEqual({ x: 200, y: 210 })
    expect(movedIris?.anchorMm).toEqual({ x: 215, y: 210 })
    expect(movedIris?.attachment?.localAnchorMm).toEqual({ x: 15, y: 0 })
  })

  it('keeps attached optics attached when dragged directly on the stage seat', () => {
    const store = useEditorStore.getState()

    store.beginComponentDrag('iris-1')
    store.updateComponentDrag('iris-1', { x: 158, y: 154 })
    store.commitComponentDrag('iris-1', { x: 158, y: 154 })

    const movedStage = useEditorStore.getState().scene.components.find((component) => component.id === 'stage-1')
    const movedIris = useEditorStore.getState().scene.components.find((component) => component.id === 'iris-1')

    expect(movedIris?.anchorMm.x).toBeGreaterThan(movedStage?.anchorMm.x ?? 0)
    expect(movedIris?.attachment?.parentComponentId).toBe('stage-1')
    expect(movedIris?.attachment?.parentMountSiteId).toBe('optic-seat')
    expect(movedIris?.attachment?.localAnchorMm.x).toBeCloseTo(
      (movedIris?.anchorMm.x ?? 0) - (movedStage?.anchorMm.x ?? 0),
      5,
    )
    expect(movedIris?.attachment?.localAnchorMm.y).toBeCloseTo(
      (movedIris?.anchorMm.y ?? 0) - (movedStage?.anchorMm.y ?? 0),
      5,
    )
  })

  it('duplicates a mounted stage with its attached optics reparented to the new stage', () => {
    const store = useEditorStore.getState()

    store.selectComponent('stage-1')
    store.duplicateSelectedComponent()

    const stages = useEditorStore
      .getState()
      .scene.components.filter((component) => component.type === 'sample-holder')
    const irises = useEditorStore
      .getState()
      .scene.components.filter((component) => component.type === 'iris')
    const duplicatedStage = stages.find((component) => component.id !== 'stage-1')
    const duplicatedIris = irises.find((component) => component.id !== 'iris-1')

    expect(stages).toHaveLength(2)
    expect(irises).toHaveLength(2)
    expect(duplicatedIris?.attachment?.parentComponentId).toBe(duplicatedStage?.id)
  })

  it('arms a sample and an iris onto separate stage seats when the stage is selected', () => {
    useEditorStore.getState().loadScene(createBareStageScene(), { history: 'reset' })

    const store = useEditorStore.getState()

    store.selectComponent('stage-1')
    store.addComponent('sample')

    let pendingDraft = useEditorStore.getState().interaction.pendingPlacement?.draft
    expect(pendingDraft?.attachment?.parentComponentId).toBe('stage-1')
    expect(pendingDraft?.attachment?.parentMountSiteId).toBe('sample-seat')
    store.commitPendingPlacement()

    store.selectComponent('stage-1')
    store.addComponent('iris', irisVariantId)

    pendingDraft = useEditorStore.getState().interaction.pendingPlacement?.draft
    expect(pendingDraft?.attachment?.parentComponentId).toBe('stage-1')
    expect(pendingDraft?.attachment?.parentMountSiteId).toBe('optic-seat')
    store.commitPendingPlacement()

    const attachedChildren = useEditorStore
      .getState()
      .scene.components.filter((component) => component.attachment?.parentComponentId === 'stage-1')

    expect(attachedChildren).toHaveLength(2)
    expect(attachedChildren.map((component) => component.attachment?.parentMountSiteId).sort()).toEqual([
      'optic-seat',
      'sample-seat',
    ])
  })

  it('arms a folded mirror pair onto a selected delay-stage optic seat', () => {
    useEditorStore.getState().loadScene({
      ...createEmptyScene(),
      components: [
        {
          id: 'delay-stage-1',
          type: 'delay-stage' as const,
          label: 'Delay Stage 1',
          variantId: delayStageVariantId,
          anchorMm: { x: 150, y: 150 },
          rotationQuarterTurns: 0 as const,
          config: createDefaultComponentConfig('delay-stage', delayStageVariantId),
        },
      ],
    }, { history: 'reset' })

    const store = useEditorStore.getState()

    store.selectComponent('delay-stage-1')
    store.addComponent('folded-mirror-pair', 'frog-delay-retroreflector')

    const pendingDraft = useEditorStore.getState().interaction.pendingPlacement?.draft

    expect(pendingDraft?.label).toBe('FMP1')
    expect(pendingDraft?.attachment?.parentComponentId).toBe('delay-stage-1')
    expect(pendingDraft?.attachment?.parentMountSiteId).toBe('optic-seat')

    store.commitPendingPlacement()
    store.beginComponentDrag('delay-stage-1')
    store.commitComponentDrag('delay-stage-1', { x: 175, y: 175 })

    const movedStage = useEditorStore
      .getState()
      .scene.components.find((component) => component.id === 'delay-stage-1')
    const foldedPair = useEditorStore
      .getState()
      .scene.components.find((component) => component.type === 'folded-mirror-pair')

    expect(foldedPair?.variantId).toBe('frog-delay-retroreflector')
    expect(foldedPair?.attachment?.parentComponentId).toBe('delay-stage-1')
    expect(foldedPair?.anchorMm.x).toBeCloseTo(
      (movedStage?.anchorMm.x ?? 0) + (foldedPair?.attachment?.localAnchorMm.x ?? 0),
      5,
    )
    expect(foldedPair?.anchorMm.y).toBeCloseTo(
      (movedStage?.anchorMm.y ?? 0) + (foldedPair?.attachment?.localAnchorMm.y ?? 0),
      5,
    )
  })

  it('does not warn that a stage overlaps its own mounted children', () => {
    const store = useEditorStore.getState()

    store.beginComponentDrag('stage-1')
    store.commitComponentDrag('stage-1', { x: 162.5, y: 162.5 })

    expect(useEditorStore.getState().interaction.notice).toBeUndefined()
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

  it('keeps the viewport fixed when selecting a component', () => {
    const store = useEditorStore.getState()

    store.selectOpticalTable()
    store.addComponent('mirror')
    store.commitPendingPlacement({ x: 2355, y: 595 })

    const componentId = useEditorStore.getState().scene.components[0]!.id

    store.setViewportSize({ width: 1400, height: 900 })
    store.setWorkspaceViewMode('board-focus')
    store.resetViewport()
    store.panViewportByScreenDelta({ x: 180, y: 96 })

    const viewportBeforeSelection = useEditorStore.getState().viewport

    store.selectComponent(componentId)

    expect(useEditorStore.getState().viewport).toEqual(viewportBeforeSelection)
    expect(useEditorStore.getState().selection).toEqual({
      type: 'component',
      componentId,
    })
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

  it('defaults armed placement to the world center of a rotated host breadboard', () => {
    const scene = useEditorStore.getState().scene

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    useEditorStore.getState().loadScene(
      {
        ...scene,
        workspace: {
          ...scene.workspace,
          breadboards: scene.workspace.breadboards.map((breadboard) =>
            breadboard.id === 'breadboard-2'
              ? {
                  ...breadboard,
                  rotationQuarterTurns: 1,
                }
              : breadboard,
          ),
        },
      },
      { history: 'reset' },
    )

    const rotatedScene = useEditorStore.getState().scene
    const rotatedBreadboard = getBreadboardInstance(rotatedScene, 'breadboard-2')
    if (!rotatedBreadboard) {
      throw new Error('expected rotated breadboard')
    }

    const expectedAnchorMm = surfaceLocalToWorld(
      rotatedScene,
      'breadboard-2',
      getNearestBoardCenterHole(rotatedBreadboard.model),
    )

    const store = useEditorStore.getState()
    store.selectBreadboard('breadboard-2')
    store.addComponent('lens')

    const pendingPlacement = useEditorStore.getState().interaction.pendingPlacement

    expect(pendingPlacement?.draft.hostSurfaceId).toBe('breadboard-2')
    expect(pendingPlacement?.draft.anchorMm).toEqual(expectedAnchorMm)
    expect(pendingPlacement?.candidateAnchorMm).toEqual(expectedAnchorMm)
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

  it('moves attached stage descendants once when their breadboard moves', () => {
    const stageVariantId = getComponentDefinition('sample-holder').defaultVariantId
    const irisVariantId = getComponentDefinition('iris').defaultVariantId
    const scene = useEditorStore.getState().scene

    useEditorStore.getState().loadScene(
      {
        ...scene,
        components: [
          {
            id: 'stage-on-board',
            type: 'sample-holder',
            label: 'Sample / Stage 1',
            variantId: stageVariantId,
            anchorMm: { x: 2362.5, y: 612.5 },
            hostSurfaceId: 'breadboard-2',
            rotationQuarterTurns: 0,
            config: createDefaultComponentConfig('sample-holder', stageVariantId),
          },
          {
            id: 'iris-on-stage',
            type: 'iris',
            label: 'Iris 1',
            variantId: irisVariantId,
            anchorMm: { x: 0, y: 0 },
            hostSurfaceId: 'breadboard-2',
            rotationQuarterTurns: 0,
            attachment: {
              parentComponentId: 'stage-on-board',
              parentMountSiteId: 'optic-seat',
              localAnchorMm: { x: 15, y: 0 },
              localRotationQuarterTurns: 0,
            },
            config: createDefaultComponentConfig('iris', irisVariantId),
          },
        ],
      },
      { history: 'reset' },
    )

    const initialStage = useEditorStore.getState().scene.components.find((component) => component.id === 'stage-on-board')
    const initialIris = useEditorStore.getState().scene.components.find((component) => component.id === 'iris-on-stage')
    const store = useEditorStore.getState()

    store.beginBreadboardDrag('breadboard-2')
    store.updateBreadboardDrag('breadboard-2', { x: 2310, y: 560 })
    store.commitBreadboardDrag('breadboard-2', { x: 2310, y: 560 })

    const movedStage = useEditorStore.getState().scene.components.find((component) => component.id === 'stage-on-board')
    const movedIris = useEditorStore.getState().scene.components.find((component) => component.id === 'iris-on-stage')

    expect(movedStage?.anchorMm).toEqual({
      x: (initialStage?.anchorMm.x ?? 0) + 30,
      y: (initialStage?.anchorMm.y ?? 0) + 40,
    })
    expect(movedIris?.anchorMm).toEqual({
      x: (initialIris?.anchorMm.x ?? 0) + 30,
      y: (initialIris?.anchorMm.y ?? 0) + 40,
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

  it('uses board-friendly reset framing for both board focus and table view', () => {
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
    const tableBreadboard = getBreadboardInstance(
      useEditorStore.getState().scene,
      'breadboard-2',
    )

    if (!tableBreadboard) {
      throw new Error('expected breadboard-2 to exist in table view')
    }

    const tableBreadboardBounds = getBreadboardWorldBoundsMm(
      tableBreadboard.model,
      tableBreadboard.anchorMm,
      tableBreadboard.rotationQuarterTurns,
    )
    const tableBoardTopPx = worldToScreen(
      { x: tableBreadboardBounds.x, y: tableBreadboardBounds.y },
      tableViewport,
    ).y

    expect(tableViewport.zoomPxPerMm).toBeCloseTo(0.93, 5)
    expect(tableBoardTopPx).toBeGreaterThan(285)
    expect(tableBoardTopPx).toBeLessThan(325)
  })

  it('restores the single-breadboard reset framing when leaving table view', () => {
    const store = useEditorStore.getState()

    store.setViewportSize({ width: 1400, height: 900 })
    store.convertWorkspaceToSingleBreadboard({ createFresh: false })

    const viewport = useEditorStore.getState().viewport
    const scene = useEditorStore.getState().scene

    if (scene.workspace.kind !== 'single-breadboard') {
      throw new Error('expected single-breadboard workspace')
    }

    const boardBounds = getBreadboardWorldBoundsMm(scene.workspace.breadboard)
    const boardTopPx = worldToScreen({ x: boardBounds.x, y: boardBounds.y }, viewport).y

    expect(viewport.zoomPxPerMm).toBeCloseTo(1.67, 5)
    expect(boardTopPx).toBeGreaterThan(95)
    expect(boardTopPx).toBeLessThan(97)
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
