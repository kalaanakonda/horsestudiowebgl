import {
  DEFAULT_SHADER_CONTROLS,
  PRESET_COMPONENT_BREAKDOWN,
  SHADER_LIBRARY,
} from '../components/voice-agent/shaderLibrary.js'

const SHADER_INDEX = new Map(SHADER_LIBRARY.map((preset) => [preset.id, preset]))

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

export function listShaderPresets() {
  return SHADER_LIBRARY.map((preset) => ({
    id: preset.id,
    name: preset.name,
    mode: preset.mode,
  }))
}

export function getShaderPreset(shaderId) {
  return SHADER_INDEX.get(shaderId) ?? null
}

export function createDefaultControls(shaderId) {
  const preset = getShaderPreset(shaderId)
  return {
    ...DEFAULT_SHADER_CONTROLS,
    ...(preset?.defaultControls ?? {}),
  }
}

export function createShaderPreset(shaderId) {
  const preset = getShaderPreset(shaderId)
  if (!preset) {
    const available = SHADER_LIBRARY.map((item) => item.id).join(', ')
    throw new Error(`Unknown shader preset \"${shaderId}\". Available presets: ${available}`)
  }

  return {
    id: preset.id,
    name: preset.name,
    mode: preset.mode,
    fragmentShader: preset.fragmentShader,
    mouseLerp: preset.mouseLerp ?? 0.08,
    noiseOverlay: preset.noiseOverlay ? structuredCloneSafe(preset.noiseOverlay) : null,
    vignetteOverlay: preset.vignetteOverlay ? structuredCloneSafe(preset.vignetteOverlay) : null,
    defaultControls: createDefaultControls(shaderId),
    components: PRESET_COMPONENT_BREAKDOWN[preset.id]?.components
      ? [...PRESET_COMPONENT_BREAKDOWN[preset.id].components]
      : [],
    families: PRESET_COMPONENT_BREAKDOWN[preset.id]?.families
      ? [...PRESET_COMPONENT_BREAKDOWN[preset.id].families]
      : [],
    summary: PRESET_COMPONENT_BREAKDOWN[preset.id]?.summary ?? '',
  }
}

export const shaderStudioVersion = '0.1.1'
