import { getDefaultSurfaceId, getBreadboardWorldBoundsMm, surfaceLocalToWorld } from './workspace'
import { getDefaultBeamSettings, parseSceneDocument } from './serialization'
import type { ComponentInstance, SceneDocument, Vector2Mm } from './types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SCENE_DOCUMENT_KIND,
  SCENE_DOCUMENT_VERSION,
  SINGLE_BREADBOARD_SURFACE_ID,
} from './types'

interface SceneImportFallbackMeta {
  kindCoerced: boolean
  versionCoerced: boolean
  wrapperInjected: boolean
}

interface SceneImportNormalizationMeta {
  hostSurfaceFixedCount: number
  localAnchorConvertedCount: number
}

export interface SceneImportDiagnostics {
  usedFallback: boolean
  kindCoerced: boolean
  versionCoerced: boolean
  wrapperInjected: boolean
  hostSurfaceFixedCount: number
  localAnchorConvertedCount: number
  emptyScene: boolean
}

export interface SceneImportResult {
  scene: SceneDocument
  diagnostics: SceneImportDiagnostics
}

const LOCAL_ANCHOR_TOLERANCE_MM = 0.5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInsideBounds(args: {
  maxX: number
  maxY: number
  minX?: number
  minY?: number
  pointMm: Vector2Mm
}) {
  const minX = args.minX ?? 0
  const minY = args.minY ?? 0

  return (
    args.pointMm.x >= minX &&
    args.pointMm.y >= minY &&
    args.pointMm.x <= args.maxX &&
    args.pointMm.y <= args.maxY
  )
}

function toCanonicalSceneJson(parsedValue: Record<string, unknown>) {
  const fallbackMeta: SceneImportFallbackMeta = {
    kindCoerced:
      typeof parsedValue.kind === 'string'
        ? parsedValue.kind !== SCENE_DOCUMENT_KIND
        : true,
    versionCoerced:
      typeof parsedValue.version === 'number'
        ? parsedValue.version !== SCENE_DOCUMENT_VERSION
        : true,
    wrapperInjected: false,
  }

  let workspaceValue = parsedValue.workspace

  if (!workspaceValue && parsedValue.breadboard !== undefined) {
    workspaceValue = {
      kind: 'single-breadboard',
      breadboard: parsedValue.breadboard,
    }
  }

  if (!workspaceValue) {
    throw new Error(
      'Scene JSON must include `workspace` or a full schema-lab scene document.',
    )
  }

  fallbackMeta.wrapperInjected = parsedValue.kind !== SCENE_DOCUMENT_KIND

  const metadataValue = isRecord(parsedValue.metadata)
    ? parsedValue.metadata
    : { name: 'Imported Scene' }

  const metadataName =
    typeof metadataValue.name === 'string' ? metadataValue.name : 'Imported Scene'
  const componentsValue = parsedValue.components
  const annotationsValue = parsedValue.annotations

  if (componentsValue !== undefined && !Array.isArray(componentsValue)) {
    throw new Error('components must be an array.')
  }

  if (annotationsValue !== undefined && !Array.isArray(annotationsValue)) {
    throw new Error('annotations must be an array.')
  }

  const canonicalValue: Record<string, unknown> = {
    kind: SCENE_DOCUMENT_KIND,
    version: SCENE_DOCUMENT_VERSION,
    metadata: {
      name: metadataName,
    },
    workspace: workspaceValue,
    beamSettings: isRecord(parsedValue.beamSettings)
      ? parsedValue.beamSettings
      : getDefaultBeamSettings(),
    components: componentsValue ?? [],
    annotations: annotationsValue ?? [],
  }

  return {
    canonicalSceneJson: JSON.stringify(canonicalValue),
    fallbackMeta,
  }
}

function normalizeSingleBreadboardComponents(
  scene: SceneDocument,
): {
  components: ComponentInstance[]
  meta: SceneImportNormalizationMeta
} {
  let hostSurfaceFixedCount = 0

  const components = scene.components.map((component) => {
    if (component.hostSurfaceId === SINGLE_BREADBOARD_SURFACE_ID) {
      return component
    }

    hostSurfaceFixedCount += 1

    return {
      ...component,
      hostSurfaceId: SINGLE_BREADBOARD_SURFACE_ID,
    }
  })

  return {
    components,
    meta: {
      hostSurfaceFixedCount,
      localAnchorConvertedCount: 0,
    },
  }
}

function normalizeOpticalTableComponents(
  scene: SceneDocument,
): {
  components: ComponentInstance[]
  meta: SceneImportNormalizationMeta
} {
  if (scene.workspace.kind !== 'optical-table') {
    return {
      components: scene.components,
      meta: {
        hostSurfaceFixedCount: 0,
        localAnchorConvertedCount: 0,
      },
    }
  }

  const workspace = scene.workspace
  const breadboardById = new Map(
    workspace.breadboards.map((breadboard) => [breadboard.id, breadboard]),
  )
  const defaultSurfaceId = getDefaultSurfaceId(scene)
  let hostSurfaceFixedCount = 0

  const withNormalizedHosts = scene.components.map((component) => {
    const currentHostSurfaceId = component.hostSurfaceId

    if (!currentHostSurfaceId) {
      hostSurfaceFixedCount += 1

      return {
        ...component,
        hostSurfaceId: defaultSurfaceId,
      }
    }

    if (
      currentHostSurfaceId !== OPTICAL_TABLE_SURFACE_ID &&
      !breadboardById.has(currentHostSurfaceId)
    ) {
      hostSurfaceFixedCount += 1

      return {
        ...component,
        hostSurfaceId: defaultSurfaceId,
      }
    }

    return component
  })

  let localAnchorConvertedCount = 0
  const nextComponents = [...withNormalizedHosts]

  for (const breadboard of workspace.breadboards) {
    const hostedIndices: number[] = []

    for (let index = 0; index < withNormalizedHosts.length; index += 1) {
      if (withNormalizedHosts[index]?.hostSurfaceId === breadboard.id) {
        hostedIndices.push(index)
      }
    }

    if (hostedIndices.length === 0) {
      continue
    }

    const worldBounds = getBreadboardWorldBoundsMm(
      breadboard.model,
      breadboard.anchorMm,
      breadboard.rotationQuarterTurns,
    )

    let localLikeCount = 0
    let worldLikeCount = 0

    for (const index of hostedIndices) {
      const component = withNormalizedHosts[index]

      if (!component) {
        continue
      }

      if (
        isInsideBounds({
          pointMm: component.anchorMm,
          minX: -LOCAL_ANCHOR_TOLERANCE_MM,
          minY: -LOCAL_ANCHOR_TOLERANCE_MM,
          maxX: breadboard.model.widthMm + LOCAL_ANCHOR_TOLERANCE_MM,
          maxY: breadboard.model.heightMm + LOCAL_ANCHOR_TOLERANCE_MM,
        })
      ) {
        localLikeCount += 1
      }

      if (
        isInsideBounds({
          pointMm: component.anchorMm,
          minX: worldBounds.x - LOCAL_ANCHOR_TOLERANCE_MM,
          minY: worldBounds.y - LOCAL_ANCHOR_TOLERANCE_MM,
          maxX: worldBounds.x + worldBounds.width + LOCAL_ANCHOR_TOLERANCE_MM,
          maxY: worldBounds.y + worldBounds.height + LOCAL_ANCHOR_TOLERANCE_MM,
        })
      ) {
        worldLikeCount += 1
      }
    }

    const hasMeaningfulTransform =
      Math.abs(breadboard.anchorMm.x) > LOCAL_ANCHOR_TOLERANCE_MM ||
      Math.abs(breadboard.anchorMm.y) > LOCAL_ANCHOR_TOLERANCE_MM ||
      breadboard.rotationQuarterTurns !== 0
    const shouldConvertLocalAnchors =
      hasMeaningfulTransform &&
      localLikeCount >= Math.max(1, Math.ceil(hostedIndices.length * 0.6)) &&
      worldLikeCount <= Math.floor(hostedIndices.length * 0.3)

    if (!shouldConvertLocalAnchors) {
      continue
    }

    for (const index of hostedIndices) {
      const component = nextComponents[index]

      if (!component) {
        continue
      }

      const convertedAnchorMm = surfaceLocalToWorld(
        scene,
        breadboard.id,
        component.anchorMm,
      )

      if (
        convertedAnchorMm.x === component.anchorMm.x &&
        convertedAnchorMm.y === component.anchorMm.y
      ) {
        continue
      }

      nextComponents[index] = {
        ...component,
        anchorMm: convertedAnchorMm,
      }
      localAnchorConvertedCount += 1
    }
  }

  return {
    components: nextComponents,
    meta: {
      hostSurfaceFixedCount,
      localAnchorConvertedCount,
    },
  }
}

function normalizeSceneForImport(scene: SceneDocument) {
  if (scene.workspace.kind === 'single-breadboard') {
    return normalizeSingleBreadboardComponents(scene)
  }

  return normalizeOpticalTableComponents(scene)
}

export function importSceneDocument(rawText: string): SceneImportResult {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(rawText)
  } catch {
    throw new Error('Scene JSON could not be parsed.')
  }

  if (!isRecord(parsedValue)) {
    throw new Error('Scene JSON must be an object.')
  }

  let scene: SceneDocument | undefined
  let usedFallback = false
  let kindCoerced = false
  let versionCoerced =
    typeof parsedValue.version !== 'number' ||
    parsedValue.version !== SCENE_DOCUMENT_VERSION
  let wrapperInjected = false

  try {
    scene = parseSceneDocument(rawText)
    kindCoerced =
      typeof parsedValue.kind === 'string'
        ? parsedValue.kind !== SCENE_DOCUMENT_KIND
        : true
  } catch {
    const { canonicalSceneJson, fallbackMeta } = toCanonicalSceneJson(parsedValue)

    scene = parseSceneDocument(canonicalSceneJson)
    usedFallback = true
    kindCoerced = fallbackMeta.kindCoerced
    versionCoerced = fallbackMeta.versionCoerced
    wrapperInjected = fallbackMeta.wrapperInjected
  }

  const normalized = normalizeSceneForImport(scene)
  const hasNormalizedComponents = normalized.components.some(
    (component, index) => component !== scene.components[index],
  )
  const nextScene = hasNormalizedComponents
    ? {
        ...scene,
        components: normalized.components,
      }
    : scene

  return {
    scene: nextScene,
    diagnostics: {
      usedFallback,
      kindCoerced,
      versionCoerced,
      wrapperInjected,
      hostSurfaceFixedCount: normalized.meta.hostSurfaceFixedCount,
      localAnchorConvertedCount: normalized.meta.localAnchorConvertedCount,
      emptyScene:
        nextScene.components.length === 0 && nextScene.annotations.length === 0,
    },
  }
}

export function formatSceneImportNotice(args: {
  currentWorkspaceKind: SceneDocument['workspace']['kind']
  result: SceneImportResult
}) {
  const nextWorkspaceKind = args.result.scene.workspace.kind
  const details: string[] = []

  if (args.currentWorkspaceKind !== nextWorkspaceKind) {
    details.push(
      nextWorkspaceKind === 'optical-table'
        ? 'Loaded an optical-table scene and switched to table view.'
        : 'Loaded a single-breadboard scene and switched to board focus.',
    )
  }

  if (args.result.diagnostics.wrapperInjected) {
    details.push('Detected shorthand JSON and wrapped it into a full scene document.')
  }

  if (args.result.diagnostics.versionCoerced) {
    details.push(`Imported using scene schema v${SCENE_DOCUMENT_VERSION}.`)
  }

  if (args.result.diagnostics.hostSurfaceFixedCount > 0) {
    details.push(
      `Repaired ${args.result.diagnostics.hostSurfaceFixedCount} invalid or missing component surface assignment${
        args.result.diagnostics.hostSurfaceFixedCount === 1 ? '' : 's'
      }.`,
    )
  }

  if (args.result.diagnostics.localAnchorConvertedCount > 0) {
    details.push(
      `Converted ${args.result.diagnostics.localAnchorConvertedCount} breadboard-local anchor${
        args.result.diagnostics.localAnchorConvertedCount === 1 ? '' : 's'
      } to world coordinates.`,
    )
  }

  if (args.result.diagnostics.emptyScene) {
    details.push('Scene loaded successfully but contains no components or annotations yet.')
  } else {
    details.push(
      `Loaded ${args.result.scene.components.length} component${
        args.result.scene.components.length === 1 ? '' : 's'
      } and ${args.result.scene.annotations.length} annotation${
        args.result.scene.annotations.length === 1 ? '' : 's'
      }.`,
    )
  }

  return details.join(' ')
}
