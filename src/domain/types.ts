export const SCENE_DOCUMENT_KIND = 'schema-lab.scene'
export const SCENE_DOCUMENT_VERSION = 1 as const

export type SceneDocumentVersion = typeof SCENE_DOCUMENT_VERSION

export interface Vector2Mm {
  x: number
  y: number
}

export interface ScreenPointPx {
  x: number
  y: number
}

export interface CanvasSizePx {
  width: number
  height: number
}

export interface BoundsMm {
  x: number
  y: number
  width: number
  height: number
}

export type QuarterTurn = 0 | 1 | 2 | 3
export type BreadboardFinish = 'black-anodized' | 'clear-anodized'
export type HoleDensity = 'single' | 'double'
export type CounterborePattern = 'none' | 'corner-25mm'
export type SnapMode = 'always' | 'onDrop'
export type CardinalDirection = 'north' | 'east' | 'south' | 'west'
export type PortKind = 'beam-input' | 'beam-output' | 'beam-bidirectional'

export type ComponentType =
  | 'laser-source'
  | 'mirror'
  | 'beamsplitter'
  | 'lens'
  | 'iris'
  | 'sample-stage'
  | 'fiber-coupler'
  | 'spectrometer'
  | 'detector'
  | 'beam-dump'

export type ComponentCategory =
  | 'source'
  | 'steering'
  | 'splitting'
  | 'focusing'
  | 'aperture'
  | 'sample'
  | 'coupling'
  | 'measurement'
  | 'termination'

export type ComponentGlyph =
  | 'laser'
  | 'mirror'
  | 'beamsplitter'
  | 'lens'
  | 'iris'
  | 'sample'
  | 'fiber'
  | 'spectrometer'
  | 'detector'
  | 'beam-dump'

export type ComponentFootprintShape = 'rect' | 'circle' | 'diamond' | 'capsule'

export interface BreadboardModel {
  label: string
  widthMm: number
  heightMm: number
  holeSpacingMm: number
  edgeMarginMm: number
  thicknessMm: number
  finish: BreadboardFinish
  holeDensity: HoleDensity
  counterborePattern: CounterborePattern
  presetId?: string
}

export interface PortDefinition {
  id: string
  label: string
  kind: PortKind
  positionMm: Vector2Mm
  direction: CardinalDirection
}

export interface ComponentRenderHint {
  shape: ComponentFootprintShape
  fill: string
  stroke: string
  glyph: ComponentGlyph
}

export interface ComponentDefinition {
  type: ComponentType
  category: ComponentCategory
  defaultLabel: string
  footprintBoundsMm: BoundsMm
  opticalCenterMm?: Vector2Mm
  ports: PortDefinition[]
  renderHint: ComponentRenderHint
}

export interface ComponentInstance {
  id: string
  type: ComponentType
  label: string
  anchorMm: Vector2Mm
  rotationQuarterTurns: QuarterTurn
}

export interface SceneDocument {
  kind: typeof SCENE_DOCUMENT_KIND
  version: SceneDocumentVersion
  metadata: {
    name: string
  }
  breadboard: BreadboardModel
  components: ComponentInstance[]
}

export interface ViewportState {
  zoomPxPerMm: number
  cameraCenterMm: Vector2Mm
  canvasSizePx: CanvasSizePx
}

export interface WorldPort extends PortDefinition {
  worldPositionMm: Vector2Mm
  worldDirection: CardinalDirection
}
