import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyScene } from '../domain/serialization'
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
