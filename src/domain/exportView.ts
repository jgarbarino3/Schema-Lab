import type {
  ExportFormat,
  ExportView,
  ResolvedExportView,
  SvgExportPreset,
} from './exportLayout'
import type { RenderMode, SceneDocument, WorkspaceViewMode } from './types'

interface ResolveExportViewArgs {
  requestedView: ExportView
  format: ExportFormat
  svgPreset?: SvgExportPreset
  renderMode: RenderMode
  workspaceViewMode: WorkspaceViewMode
  scene: SceneDocument
}

export function isAngledExportAvailable(
  scene: SceneDocument,
  renderMode: RenderMode,
): boolean {
  return scene.workspace.kind === 'optical-table' && renderMode === 'realistic'
}

export function resolveExportView({
  requestedView,
  format,
  svgPreset,
  renderMode,
  workspaceViewMode,
  scene,
}: ResolveExportViewArgs): ResolvedExportView {
  if (format === 'dxf' || (format === 'svg' && svgPreset !== 'presentation')) {
    return 'top-down'
  }

  if (requestedView === 'top-down') {
    return 'top-down'
  }

  const angledAvailable = isAngledExportAvailable(scene, renderMode)

  if (requestedView === 'angled') {
    if (!angledAvailable) {
      throw new Error(
        'Angled export requires a realistic optical-table scene.',
      )
    }

    return 'angled'
  }

  return angledAvailable && workspaceViewMode === 'table-view'
    ? 'angled'
    : 'top-down'
}
