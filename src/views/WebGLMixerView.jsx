import { useMemo, useState } from 'react'
import WebGLMixerCanvas from '../components/mixer/WebGLMixerCanvas'

const MODULE_LIBRARY = [
  { id: 'noise', label: 'Noise Field', family: 'Field', color: '#67e8f9' },
  { id: 'voronoi', label: 'Cell Domain', family: 'Field', color: '#60a5fa' },
  { id: 'warp', label: 'Vortex Warp', family: 'Distortion', color: '#c4b5fd' },
  { id: 'ripple', label: 'Ripple Rings', family: 'Interaction', color: '#f9a8d4' },
  { id: 'stripes', label: 'Stripe Slicer', family: 'Structure', color: '#fcd34d' },
  { id: 'dither', label: 'Dither Quant', family: 'Texture', color: '#86efac' },
  { id: 'grain', label: 'Film Grain', family: 'Texture', color: '#4ade80' },
  { id: 'bloom', label: 'Bloom Lift', family: 'Post FX', color: '#fca5a5' },
]

const SLOT_COUNT = 6

const DEFAULT_CONTROLS = {
  speed: 1,
  scale: 1,
  intensity: 1,
  reactivity: 1,
  hueShift: 0,
  colorA: '#7dd3fc',
  colorB: '#6366f1',
  colorC: '#f472b6',
}

function moduleById(id) {
  return MODULE_LIBRARY.find((item) => item.id === id) ?? null
}

function deriveWeights(slots) {
  const base = {
    noise: 0,
    warp: 0,
    ripple: 0,
    stripes: 0,
    dither: 0,
    grain: 0,
    bloom: 0,
    voronoi: 0,
  }

  slots.forEach((slot) => {
    if (!slot?.moduleId) return
    if (!(slot.moduleId in base)) return
    base[slot.moduleId] += slot.strength
  })

  Object.keys(base).forEach((key) => {
    base[key] = Math.min(1, base[key])
  })

  return base
}

function Slider({ label, value, min, max, step, onChange }) {
  const numeric = Number(value)
  const displayValue = Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(2)
  return (
    <label className="mixer-slider">
      <span className="mixer-slider__meta">
        <span>{label}</span>
        <span>{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function WebGLMixerView({ onNavigate }) {
  const [slots, setSlots] = useState(
    Array.from({ length: SLOT_COUNT }, () => ({ moduleId: null, strength: 0.6 })),
  )
  const [controls, setControls] = useState(DEFAULT_CONTROLS)
  const [exportStatus, setExportStatus] = useState('')

  const weights = useMemo(() => deriveWeights(slots), [slots])

  const onDragStart = (module, event) => {
    const payload = JSON.stringify({ moduleId: module.id })
    event.dataTransfer.setData('application/x-mixer-module', payload)
    event.dataTransfer.setData('text/plain', payload)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onDropSlot = (index, event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/x-mixer-module')
      || event.dataTransfer.getData('text/plain')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (!parsed.moduleId || !moduleById(parsed.moduleId)) return
      setSlots((current) =>
        current.map((slot, slotIndex) =>
          slotIndex === index ? { ...slot, moduleId: parsed.moduleId } : slot,
        ),
      )
    } catch {
      // no-op
    }
  }

  const onAddToFirstOpenSlot = (moduleId) => {
    setSlots((current) => {
      const target = current.findIndex((slot) => !slot.moduleId)
      if (target === -1) return current
      return current.map((slot, index) => (index === target ? { ...slot, moduleId } : slot))
    })
  }

  const onClearSlot = (index) => {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, moduleId: null } : slot,
      ),
    )
  }

  const onStrengthChange = (index, value) => {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, strength: value } : slot,
      ),
    )
  }

  const onResetScene = () => {
    setSlots(Array.from({ length: SLOT_COUNT }, () => ({ moduleId: null, strength: 0.6 })))
    setControls(DEFAULT_CONTROLS)
  }

  const onExport = async () => {
    const payload = {
      app: 'webgl-mixer-studio',
      slots,
      controls,
      generatedAt: new Date().toISOString(),
    }
    const command = `npx webgl-mixer apply --config '${JSON.stringify(payload).replaceAll("'", "\\'")}'`
    try {
      await navigator.clipboard.writeText(command)
      setExportStatus('Command copied')
    } catch {
      setExportStatus('Copy failed')
    }
  }

  return (
    <main className="mixer-screen">
      <WebGLMixerCanvas controls={controls} moduleWeights={weights} />
      <div className="mixer-overlay" />

      <div className="mixer-ui">
        <header className="mixer-header">
          <div>
            <p className="mixer-header__eyebrow">From Scratch</p>
            <h1>WebGL Mixer Studio</h1>
          </div>
          <div className="mixer-header__actions">
            <button type="button" onClick={onExport}>Export Command</button>
            <button type="button" onClick={onResetScene}>Reset</button>
            <button type="button" onClick={() => onNavigate('/voice-agent')}>Back</button>
          </div>
        </header>

        <section className="mixer-layout">
          <aside className="mixer-panel mixer-panel--library">
            <p className="mixer-panel__title">Modules</p>
            <div className="mixer-module-list">
              {MODULE_LIBRARY.map((module) => (
                <div key={module.id} className="mixer-module-row">
                  <button
                    type="button"
                    draggable
                    className="mixer-module-chip"
                    style={{ '--mod-color': module.color }}
                    onDragStart={(event) => onDragStart(module, event)}
                  >
                    <span className="mixer-module-dot" />
                    <span>{module.label}</span>
                    <small>{module.family}</small>
                  </button>
                  <button
                    type="button"
                    className="mixer-module-add"
                    onClick={() => onAddToFirstOpenSlot(module.id)}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="mixer-stage">
            <div className="mixer-stage__meta">
              <span>Drop modules into slots to build the effect graph.</span>
              <span>{exportStatus || 'Compose and tweak controls on the right.'}</span>
            </div>

            <div className="mixer-slots">
              {slots.map((slot, index) => {
                const module = moduleById(slot.moduleId)
                return (
                  <div
                    key={`slot-${index + 1}`}
                    className={`mixer-slot ${module ? 'mixer-slot--filled' : ''}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDropSlot(index, event)}
                  >
                    <div className="mixer-slot__head">
                      <span>{`Slot ${index + 1}`}</span>
                      {module ? (
                        <button type="button" onClick={() => onClearSlot(index)}>Clear</button>
                      ) : null}
                    </div>
                    {module ? (
                      <div className="mixer-slot__body">
                        <div className="mixer-slot__module">{module.label}</div>
                        <Slider
                          label="Strength"
                          value={slot.strength}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(value) => onStrengthChange(index, value)}
                        />
                      </div>
                    ) : (
                      <div className="mixer-slot__empty">Drop module here</div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="mixer-panel mixer-panel--controls">
            <p className="mixer-panel__title">Controls</p>
            <div className="mixer-control-list">
              <Slider
                label="Speed"
                value={controls.speed}
                min={0}
                max={3}
                step={0.01}
                onChange={(value) => setControls((current) => ({ ...current, speed: value }))}
              />
              <Slider
                label="Scale"
                value={controls.scale}
                min={0.2}
                max={2.8}
                step={0.01}
                onChange={(value) => setControls((current) => ({ ...current, scale: value }))}
              />
              <Slider
                label="Intensity"
                value={controls.intensity}
                min={0}
                max={2}
                step={0.01}
                onChange={(value) => setControls((current) => ({ ...current, intensity: value }))}
              />
              <Slider
                label="Reactivity"
                value={controls.reactivity}
                min={0}
                max={2}
                step={0.01}
                onChange={(value) => setControls((current) => ({ ...current, reactivity: value }))}
              />
              <Slider
                label="Hue Shift"
                value={controls.hueShift}
                min={-180}
                max={180}
                step={1}
                onChange={(value) => setControls((current) => ({ ...current, hueShift: value }))}
              />
              <label className="mixer-color-row">
                <span>Color A</span>
                <input
                  type="color"
                  value={controls.colorA}
                  onChange={(event) => setControls((current) => ({ ...current, colorA: event.target.value }))}
                />
              </label>
              <label className="mixer-color-row">
                <span>Color B</span>
                <input
                  type="color"
                  value={controls.colorB}
                  onChange={(event) => setControls((current) => ({ ...current, colorB: event.target.value }))}
                />
              </label>
              <label className="mixer-color-row">
                <span>Color C</span>
                <input
                  type="color"
                  value={controls.colorC}
                  onChange={(event) => setControls((current) => ({ ...current, colorC: event.target.value }))}
                />
              </label>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

export default WebGLMixerView
