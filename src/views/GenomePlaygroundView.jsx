import { useEffect, useMemo, useState } from 'react'
import AuroraBackground from '../components/voice-agent/AuroraBackground'
import {
  COMPONENT_FAMILY_META,
  DEFAULT_SHADER_CONTROLS,
  PRESET_COMPONENT_BREAKDOWN,
  SHADER_LIBRARY,
} from '../components/voice-agent/shaderLibrary'

const FAMILY_ORDER = ['field', 'structure', 'interaction', 'motion', 'texture', 'post']
const SHAPES = ['default', 'orb', 'slit', 'ribbon', 'shard']
const GEOMETRIES = ['torus', 'sphere', 'knot', 'shard']

const CONTROL_GROUPS = [
  {
    title: 'Color',
    controls: [
      { key: 'colorA', label: 'Color A', type: 'color' },
      { key: 'colorB', label: 'Color B', type: 'color' },
      { key: 'colorC', label: 'Color C', type: 'color' },
      { key: 'tintMix', label: 'Tint', min: 0, max: 0.65, step: 0.01 },
      { key: 'saturation', label: 'Saturation', min: 0, max: 3, step: 0.01 },
      { key: 'hueShift', label: 'Hue', min: -180, max: 180, step: 1 },
    ],
  },
  {
    title: 'Motion',
    controls: [
      { key: 'speed', label: 'Speed', min: 0, max: 3, step: 0.01 },
      { key: 'cursorReaction', label: 'Reaction', min: 0, max: 3, step: 0.01 },
      { key: 'curves', label: 'Curves', min: 0, max: 1.5, step: 0.01 },
      { key: 'turbulence', label: 'Turbulence', min: 0, max: 1.5, step: 0.01 },
      { key: 'softness', label: 'Softness', min: 0, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: 'Stage',
    controls: [
      { key: 'scale', label: 'Scale', min: 0.5, max: 2.5, step: 0.01 },
      { key: 'effectSize', label: 'Effect', min: 0.5, max: 2.5, step: 0.01 },
      { key: 'positionX', label: 'Pos X', min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'Pos Y', min: -1, max: 1, step: 0.01 },
      { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1 },
    ],
  },
]

function buildComponentCatalog() {
  const componentMap = new Map()
  Object.entries(PRESET_COMPONENT_BREAKDOWN).forEach(([presetId, breakdown]) => {
    breakdown.components.forEach((component, index) => {
      const family = breakdown.families[index] ?? breakdown.families[0]
      if (!componentMap.has(component)) {
        componentMap.set(component, {
          name: component,
          families: new Set(),
          presets: new Set(),
        })
      }
      const row = componentMap.get(component)
      row.families.add(family)
      row.presets.add(presetId)
    })
  })

  const grouped = {}
  FAMILY_ORDER.forEach((family) => {
    grouped[family] = []
  })

  componentMap.forEach((value) => {
    const primaryFamily = FAMILY_ORDER.find((family) => value.families.has(family)) ?? FAMILY_ORDER[0]
    grouped[primaryFamily].push({
      name: value.name,
      families: [...value.families],
      presets: [...value.presets],
    })
  })

  FAMILY_ORDER.forEach((family) => {
    grouped[family].sort((a, b) => a.name.localeCompare(b.name))
  })

  return grouped
}

function scorePreset({ slots, presetId }) {
  const breakdown = PRESET_COMPONENT_BREAKDOWN[presetId]
  if (!breakdown) return -1
  let score = 0

  FAMILY_ORDER.forEach((family) => {
    const component = slots[family]
    if (!component) return

    if (breakdown.components.includes(component.name)) score += 5
    if (breakdown.families.includes(family)) score += 2
    if (component.families.includes(family)) score += 1
  })

  return score
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hashString(input) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function hslToHex(h, s, l) {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = light - c / 2
  let r = 0
  let g = 0
  let b = 0

  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = (value) => {
    const channel = Math.round((value + m) * 255)
    return channel.toString(16).padStart(2, '0')
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function deriveSlotControls(slots, baseControls) {
  const derived = { ...baseControls }
  const filledFamilies = FAMILY_ORDER.filter((family) => slots[family])

  filledFamilies.forEach((family) => {
    const component = slots[family]
    const seed = hashString(component.name)
    const intensity = 0.18 + ((seed % 100) / 100) * 0.42
    const polarity = seed % 2 === 0 ? 1 : -1

    if (family === 'field') {
      derived.curves = clamp(derived.curves + intensity * 0.9, 0, 1.5)
      derived.effectSize = clamp(derived.effectSize + intensity * 0.7, 0.5, 2.5)
      derived.speed = clamp(derived.speed + intensity * 0.4, 0, 3)
    }
    if (family === 'structure') {
      derived.shapePreset = SHAPES[seed % SHAPES.length]
      derived.geometryPreset = GEOMETRIES[seed % GEOMETRIES.length]
      derived.scale = clamp(derived.scale + intensity * 0.6, 0.5, 2.5)
      derived.rotation = clamp(derived.rotation + polarity * intensity * 40, -180, 180)
    }
    if (family === 'interaction') {
      derived.cursorReaction = clamp(derived.cursorReaction + intensity * 1.2, 0, 3)
      derived.cursorMovement = clamp(derived.cursorMovement + intensity * 0.7, 0, 2)
      derived.cursorSize = clamp(derived.cursorSize + intensity * 0.8, 0.2, 3)
    }
    if (family === 'motion') {
      derived.speed = clamp(derived.speed + intensity * 0.8, 0, 3)
      derived.turbulence = clamp(derived.turbulence + intensity, 0, 1.5)
      derived.rotation = clamp(derived.rotation + polarity * intensity * 65, -180, 180)
    }
    if (family === 'texture') {
      derived.grain = clamp(derived.grain + intensity, 0, 1.5)
      derived.softness = clamp(derived.softness + intensity * 0.8, 0, 1.5)
      derived.contrast = clamp(derived.contrast + intensity * 0.35, 0.4, 2)
    }
    if (family === 'post') {
      derived.blur = clamp(derived.blur + intensity * 10, 0, 24)
      derived.vignette = clamp(derived.vignette + intensity * 0.3, 0, 1)
      derived.tintMix = clamp(derived.tintMix + intensity * 0.3, 0, 0.65)
      derived.brightness = clamp(derived.brightness + polarity * intensity * 0.12, 0.4, 2)
    }
  })

  if (filledFamilies.length > 0) {
    const combinedSeed = hashString(
      filledFamilies.map((family) => slots[family]?.name ?? '').join('|'),
    )
    const baseHue = combinedSeed % 360
    derived.colorA = hslToHex((baseHue + 15) % 360, 78, 66)
    derived.colorB = hslToHex((baseHue + 92) % 360, 72, 58)
    derived.colorC = hslToHex((baseHue + 188) % 360, 68, 50)
    derived.hueShift = clamp(derived.hueShift + ((combinedSeed % 100) / 100) * 50 - 25, -180, 180)
  }

  return derived
}

function ControlField({ control, value, onChange }) {
  if (control.type === 'color') {
    return (
      <label className="gp-control-field gp-control-field--color">
        <span className="gp-control-label">{control.label}</span>
        <input
          className="gp-control-color"
          type="color"
          value={value}
          onChange={(event) => onChange(control.key, event.target.value)}
        />
      </label>
    )
  }

  const numericValue = Number(value)
  const displayValue = Math.abs(numericValue) >= 100 || Number.isInteger(numericValue)
    ? numericValue.toFixed(0)
    : numericValue.toFixed(2)

  return (
    <label className="gp-control-field">
      <span className="gp-control-meta">
        <span className="gp-control-label">{control.label}</span>
        <span className="gp-control-value">{displayValue}</span>
      </span>
      <input
        className="gp-control-range"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(control.key, Number(event.target.value))}
      />
    </label>
  )
}

function GenomePlaygroundView({ onNavigate }) {
  const componentCatalog = useMemo(() => buildComponentCatalog(), [])
  const [slots, setSlots] = useState(() =>
    Object.fromEntries(FAMILY_ORDER.map((family) => [family, null])),
  )
  const [activeShaderId, setActiveShaderId] = useState(SHADER_LIBRARY[0]?.id)
  const [controlsByShader, setControlsByShader] = useState(() =>
    Object.fromEntries(
      SHADER_LIBRARY.map((shader) => [shader.id, { ...DEFAULT_SHADER_CONTROLS }]),
    ),
  )
  const [exportStatus, setExportStatus] = useState('')

  const activeShader = useMemo(
    () => SHADER_LIBRARY.find((shader) => shader.id === activeShaderId) ?? SHADER_LIBRARY[0],
    [activeShaderId],
  )
  const activeControls = controlsByShader[activeShader.id] ?? DEFAULT_SHADER_CONTROLS
  const mixedControls = useMemo(
    () => deriveSlotControls(slots, activeControls),
    [slots, activeControls],
  )

  useEffect(() => {
    let winner = activeShaderId
    let maxScore = -1

    SHADER_LIBRARY.forEach((shader) => {
      const score = scorePreset({ slots, presetId: shader.id })
      if (score > maxScore) {
        maxScore = score
        winner = shader.id
      }
    })

    if (winner && winner !== activeShaderId && maxScore > 0) {
      setActiveShaderId(winner)
    }
  }, [slots, activeShaderId])

  const noiseOverlayStyle = useMemo(() => {
    if (!activeShader.noiseOverlay) return null
    const { baseFrequency, opacity } = activeShader.noiseOverlay
    return {
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='${opacity}'/%3E%3C/svg%3E")`,
    }
  }, [activeShader.noiseOverlay])

  const vignetteOverlayStyle = useMemo(() => {
    if (!activeShader.vignetteOverlay) return null
    return { background: activeShader.vignetteOverlay.background }
  }, [activeShader.vignetteOverlay])

  const colorWashStyle = useMemo(
    () => ({
      background: `linear-gradient(130deg, ${mixedControls.colorA}, ${mixedControls.colorB} 52%, ${mixedControls.colorC})`,
      opacity: mixedControls.tintMix,
      mixBlendMode: mixedControls.blendMode,
    }),
    [mixedControls],
  )

  const onControlChange = (key, value) => {
    setControlsByShader((current) => ({
      ...current,
      [activeShader.id]: {
        ...current[activeShader.id],
        [key]: value,
      },
    }))
  }

  const onDropToSlot = (family, event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/x-genome-component')
      || event.dataTransfer.getData('text/plain')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      setSlots((current) => ({
        ...current,
        [family]: parsed,
      }))
    } catch {
      // no-op
    }
  }

  const onDragStartComponent = (component, event) => {
    const payload = JSON.stringify(component)
    event.dataTransfer.setData('application/x-genome-component', payload)
    event.dataTransfer.setData('text/plain', payload)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onQuickAddComponent = (family, component) => {
    setSlots((current) => ({
      ...current,
      [family]: component,
    }))
  }

  const onClearSlot = (family) => {
    setSlots((current) => ({
      ...current,
      [family]: null,
    }))
  }

  const onResetSlots = () => {
    setSlots(Object.fromEntries(FAMILY_ORDER.map((family) => [family, null])))
  }

  const onExportRecipe = async () => {
    const payload = {
      route: '/genome-playground',
      shaderId: activeShader.id,
      slots: Object.fromEntries(
        FAMILY_ORDER.map((family) => [family, slots[family]?.name ?? null]),
      ),
      controls: mixedControls,
    }

    const command = `npx aura-genome apply --recipe '${JSON.stringify(payload).replaceAll("'", "\\'")}'`
    try {
      await navigator.clipboard.writeText(command)
      setExportStatus('Recipe command copied')
    } catch {
      setExportStatus('Copy failed, command generated in panel')
    }
  }

  return (
    <main className="genome-playground-screen">
      <AuroraBackground shaderId={activeShader.id} controls={mixedControls} />
      {noiseOverlayStyle ? <div className="noise-overlay" style={noiseOverlayStyle} aria-hidden="true" /> : null}
      {vignetteOverlayStyle ? <div className="vignette-overlay" style={vignetteOverlayStyle} aria-hidden="true" /> : null}
      {mixedControls.tintMix > 0.001 ? (
        <div className="colorwash-overlay" style={colorWashStyle} aria-hidden="true" />
      ) : null}

      <div className="genome-playground-ui">
        <header className="gp-header">
          <div>
            <p className="gp-header__eyebrow">Separate App</p>
            <h1 className="gp-header__title">Genome Playground</h1>
          </div>
          <div className="gp-header__actions">
            <button type="button" className="gp-btn" onClick={onExportRecipe}>
              Export Recipe
            </button>
            <button type="button" className="gp-btn" onClick={() => onNavigate('/voice-agent')}>
              Back To Voice UI
            </button>
          </div>
        </header>

        <section className="gp-body">
          <aside className="gp-panel gp-panel--library">
            <div className="gp-panel__title">Component Library</div>
            <div className="gp-family-list">
              {FAMILY_ORDER.map((family) => (
                <section key={family} className="gp-family-group">
                  <div className="gp-family-heading">
                    <span
                      className="gp-family-color"
                      style={{ background: COMPONENT_FAMILY_META[family]?.color }}
                    />
                    {COMPONENT_FAMILY_META[family]?.label ?? family}
                  </div>
                  <div className="gp-chip-grid">
                    {componentCatalog[family].map((component) => (
                      <div key={`${family}-${component.name}`} className="gp-chip-wrap">
                        <button
                          type="button"
                          draggable
                          className="gp-chip"
                          onDragStart={(event) => onDragStartComponent(component, event)}
                          title="Drag into a slot"
                        >
                          {component.name}
                        </button>
                        <button
                          type="button"
                          className="gp-chip-add"
                          onClick={() => onQuickAddComponent(family, component)}
                          title="Add to this family slot"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <section className="gp-stage">
            <div className="gp-stage__card">
              <div className="gp-stage__label">Live Viewport</div>
              <p className="gp-stage__shader">{activeShader.name}</p>
              <p className="gp-stage__hint">
                Drop components into family slots below to auto-remix preset behavior.
              </p>
              <p className="gp-stage__mix">
                Active families: {FAMILY_ORDER.filter((family) => slots[family]).length} / {FAMILY_ORDER.length}
              </p>
            </div>

            <div className="gp-slots">
              {FAMILY_ORDER.map((family) => (
                <div
                  key={`slot-${family}`}
                  className={`gp-slot ${slots[family] ? 'gp-slot--filled' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDropToSlot(family, event)}
                >
                  <div className="gp-slot__head">
                    <span>{COMPONENT_FAMILY_META[family]?.label ?? family}</span>
                    {slots[family] ? (
                      <button
                        type="button"
                        className="gp-slot__clear"
                        onClick={() => onClearSlot(family)}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="gp-slot__body">
                    {slots[family] ? (
                      <span className="gp-slot__chip">{slots[family].name}</span>
                    ) : (
                      <span className="gp-slot__empty">Drop component here</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="gp-stage__footer">
              <button type="button" className="gp-btn gp-btn--ghost" onClick={onResetSlots}>
                Reset Slots
              </button>
              <span className="gp-export-status">{exportStatus || 'Ready to compose'}</span>
            </div>
          </section>

          <aside className="gp-panel gp-panel--controls">
            <div className="gp-panel__title">Controls</div>
            {CONTROL_GROUPS.map((group) => (
              <section key={group.title} className="gp-control-section">
                <h3>{group.title}</h3>
                <div className="gp-control-grid">
                  {group.controls.map((control) => (
                    <ControlField
                      key={control.key}
                      control={control}
                      value={activeControls[control.key]}
                      onChange={onControlChange}
                    />
                  ))}
                </div>
              </section>
            ))}
          </aside>
        </section>
      </div>
    </main>
  )
}

export default GenomePlaygroundView
