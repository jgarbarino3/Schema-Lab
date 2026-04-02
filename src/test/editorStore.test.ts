import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyScene } from '../domain/serialization'
import { useEditorStore } from '../state/editorStore'

describe('editor store pending placement', () => {
  beforeEach(() => {
    useEditorStore.getState().loadScene(createEmptyScene())
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
