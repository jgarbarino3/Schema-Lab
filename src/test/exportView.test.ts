import { describe, expect, it } from 'vitest'
import { resolveExportView, isAngledExportAvailable } from '../domain/exportView'
import { createEmptyScene } from '../domain/serialization'
import { convertSceneToOpticalTable } from '../domain/workspace'

describe('export view resolution', () => {
  it('uses the live angled table view for Current view when the scene is eligible', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    expect(isAngledExportAvailable(scene, 'realistic')).toBe(true)
    expect(
      resolveExportView({
        requestedView: 'current',
        format: 'png',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene,
      }),
    ).toBe('angled')
  })

  it('resolves Current view to top-down outside the live realistic Table View', () => {
    const opticalTableScene = convertSceneToOpticalTable(createEmptyScene())
    const breadboardScene = createEmptyScene()

    expect(
      resolveExportView({
        requestedView: 'current',
        format: 'pdf',
        renderMode: 'realistic',
        workspaceViewMode: 'board-focus',
        scene: opticalTableScene,
      }),
    ).toBe('top-down')
    expect(
      resolveExportView({
        requestedView: 'current',
        format: 'pptx',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene: breadboardScene,
      }),
    ).toBe('top-down')
    expect(
      resolveExportView({
        requestedView: 'current',
        format: 'png',
        renderMode: 'simple',
        workspaceViewMode: 'table-view',
        scene: opticalTableScene,
      }),
    ).toBe('top-down')
  })

  it('keeps engineering SVG and DXF top-down regardless of a requested view', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    expect(
      resolveExportView({
        requestedView: 'angled',
        format: 'svg',
        svgPreset: 'engineering',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene,
      }),
    ).toBe('top-down')
    expect(
      resolveExportView({
        requestedView: 'angled',
        format: 'dxf',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene,
      }),
    ).toBe('top-down')
  })

  it('rejects an explicit angled presentation export when no angled renderer is valid', () => {
    const breadboardScene = createEmptyScene()
    const simpleTableScene = convertSceneToOpticalTable(createEmptyScene())

    expect(() =>
      resolveExportView({
        requestedView: 'angled',
        format: 'svg',
        svgPreset: 'presentation',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene: breadboardScene,
      }),
    ).toThrow('Angled export requires a realistic optical-table scene.')
    expect(() =>
      resolveExportView({
        requestedView: 'angled',
        format: 'png',
        renderMode: 'simple',
        workspaceViewMode: 'table-view',
        scene: simpleTableScene,
      }),
    ).toThrow('Angled export requires a realistic optical-table scene.')
  })

  it('honors an explicit top-down view in an eligible scene', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    expect(
      resolveExportView({
        requestedView: 'top-down',
        format: 'png',
        renderMode: 'realistic',
        workspaceViewMode: 'table-view',
        scene,
      }),
    ).toBe('top-down')
  })
})
