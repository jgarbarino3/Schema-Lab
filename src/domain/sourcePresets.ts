import type { SourcePresetDefinition, SourcePresetId } from './types'

export const SOURCE_PRESETS: SourcePresetDefinition[] = [
  {
    id: 'ti-sapphire',
    label: 'Ti:Sapph',
    description: 'Common ultrafast Ti:Sapphire tuning range for visible/NIR FROG work.',
    wavelengthNm: 800,
    bandwidthNm: 35,
    powerMw: 450,
    beamDiameterMm: 2.2,
    divergenceMrad: 1.1,
    supportedWavelengthNm: {
      minNm: 700,
      maxNm: 1000,
    },
  },
  {
    id: 'libra',
    label: 'Libra',
    description: 'Coherent Libra-class Ti:Sapphire amplifier body for table-mounted OPA workflows.',
    wavelengthNm: 800,
    bandwidthNm: 28,
    powerMw: 2500,
    beamDiameterMm: 5,
    divergenceMrad: 0.45,
    supportedWavelengthNm: {
      minNm: 760,
      maxNm: 840,
    },
  },
  {
    id: 'pharos',
    label: 'Pharos',
    description: 'Yb-based industrial ultrafast source, commonly around 1030 nm.',
    wavelengthNm: 1030,
    bandwidthNm: 8,
    powerMw: 1200,
    beamDiameterMm: 2.6,
    divergenceMrad: 0.8,
    supportedWavelengthNm: {
      minNm: 1020,
      maxNm: 1040,
    },
  },
  {
    id: 'clark-ti-sapphire',
    label: 'Clark Ti:Sapph',
    description: 'Clark-MXR-style Ti:Sapphire oscillator or amplifier defaults for tabletop ultrafast work.',
    wavelengthNm: 800,
    bandwidthNm: 32,
    powerMw: 900,
    beamDiameterMm: 3.2,
    divergenceMrad: 0.9,
    supportedWavelengthNm: {
      minNm: 760,
      maxNm: 840,
    },
  },
  {
    id: 'opa-visible-passband',
    label: 'OPA Visible Passband',
    description: 'Narrower visible OPA output for targeted wavelength selection.',
    wavelengthNm: 620,
    bandwidthNm: 18,
    powerMw: 220,
    beamDiameterMm: 2.4,
    divergenceMrad: 1.3,
    supportedWavelengthNm: {
      minNm: 500,
      maxNm: 750,
    },
  },
  {
    id: 'opa-visible-broadband',
    label: 'OPA Visible Broadband',
    description: 'Broader visible OPA output with bandwidth-forward defaults.',
    wavelengthNm: 580,
    bandwidthNm: 80,
    powerMw: 160,
    beamDiameterMm: 2.8,
    divergenceMrad: 1.6,
    supportedWavelengthNm: {
      minNm: 480,
      maxNm: 750,
    },
  },
]

export const SOURCE_PRESETS_BY_ID = Object.fromEntries(
  SOURCE_PRESETS.map((preset) => [preset.id, preset]),
) as Record<SourcePresetId, SourcePresetDefinition>

export function getSourcePreset(id: SourcePresetId) {
  return SOURCE_PRESETS_BY_ID[id]
}
