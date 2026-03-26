import { useMemo, useState } from 'react'
import {
  PRESET_COMPONENT_BREAKDOWN,
  SHADER_CONTROL_SECTIONS,
} from './shaderLibrary'

const MODE_CONTROL_ALLOWLIST = {
  shader: new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'softness', 'grain',
    'brightness', 'contrast', 'saturation', 'hueShift', 'opacity', 'blur',
    'colorA', 'colorB', 'colorC', 'shapePreset', 'blendMode',
  ]),
  'three-meditative-ripples': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'cursorSize', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'brightness', 'contrast',
    'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC', 'shapePreset', 'blendMode',
  ]),
  'three-displacement-blob': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'brightness', 'contrast',
    'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC', 'shapePreset', 'blendMode',
  ]),
  'three-ditherfx-object': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'softness',
    'brightness', 'contrast', 'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC', 'ditherBgColor',
    'geometryPreset', 'shapePreset', 'blendMode',
  ]),
  'three-nebula': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence',
    'brightness', 'contrast', 'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC',
    'shapePreset', 'blendMode',
  ]),
  'webgl2-reactant-field': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'brightness', 'contrast', 'saturation', 'hueShift',
    'opacity', 'blur', 'colorA', 'colorB', 'colorC', 'shapePreset', 'blendMode',
  ]),
  'canvas2d-led': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'cursorSize', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'softness', 'grain',
    'brightness', 'contrast', 'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC',
    'shapePreset', 'blendMode',
  ]),
  'canvas2d-ripped-ascii': new Set([
    'rotation', 'cursorMovement', 'cursorReaction', 'cursorSize', 'effectSize', 'scale', 'positionX', 'positionY',
    'cursorOffsetX', 'cursorOffsetY', 'speed', 'curves', 'turbulence', 'softness', 'grain',
    'brightness', 'contrast', 'saturation', 'hueShift', 'opacity', 'blur', 'colorA', 'colorB', 'colorC',
    'shapePreset', 'blendMode',
  ]),
}

const DEFAULT_ALLOWED_CONTROLS = MODE_CONTROL_ALLOWLIST.shader

function ControlField({ control, value, onChange }) {
  if (control.type === 'color') {
    return (
      <label className="control-field control-field--color">
        <span className="control-label">{control.label}</span>
        <input
          className="control-color"
          type="color"
          value={value}
          onInput={(event) => onChange(control.key, event.target.value)}
          onChange={(event) => onChange(control.key, event.target.value)}
        />
      </label>
    )
  }

  if (control.type === 'select') {
    return (
      <label className="control-field">
        <span className="control-label">{control.label}</span>
        <select
          className="control-select"
          value={value}
          onChange={(event) => onChange(control.key, event.target.value)}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const numericValue = Number(value)
  const displayValue = Math.abs(numericValue) >= 100 || Number.isInteger(numericValue)
    ? numericValue.toFixed(0)
    : numericValue.toFixed(2)

  return (
    <label className="control-field">
      <span className="control-meta">
        <span className="control-label">{control.label}</span>
        <span className="control-value">{displayValue}</span>
      </span>
      <input
        className="control-range"
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

function ShaderWorkbench({
  activeShader,
  controls,
  onControlChange,
  onReset,
  shaderIndex,
  shaderTotal,
  ditherModelFile,
  ditherModelStatus,
  onDitherModelUpload,
  onDitherModelClear,
}) {
  const [npmStatus, setNpmStatus] = useState('')
  const [tip, setTip] = useState({ visible: false, x: 0, y: 0 })
  const allowed = MODE_CONTROL_ALLOWLIST[activeShader.mode] ?? DEFAULT_ALLOWED_CONTROLS
  const layerInfo = PRESET_COMPONENT_BREAKDOWN[activeShader.id]

  const visibleSections = useMemo(
    () => SHADER_CONTROL_SECTIONS
      .map((section) => ({
        ...section,
        controls: section.controls.filter((control) => allowed.has(control.key)),
      }))
      .filter((section) => section.controls.length > 0),
    [allowed],
  )

  const npmSnippet = `npm i @horsestudio/shader-studio\n\nimport { createShaderPreset } from '@horsestudio/shader-studio'\n\nconst shader = createShaderPreset('${activeShader.id}')`

  const onCopyNpm = async () => {
    try {
      await navigator.clipboard.writeText(npmSnippet)
      setNpmStatus('Copied npm snippet')
    } catch {
      setNpmStatus('Copy failed')
    }
  }

  return (
    <section className="shader-workbench" aria-label="Shader controls">
      <aside
        className="shader-workbench__panel shader-workbench__panel--left layer-editor-panel"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setTip({
            visible: true,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          })
        }}
        onMouseLeave={() => setTip((current) => ({ ...current, visible: false }))}
      >
        <div className="shader-workbench__panel-head">
          <p className="shader-workbench__eyebrow">Layer Editor</p>
          <h2 className="shader-workbench__title">{activeShader.name}</h2>
          <p className="shader-workbench__summary">
            Read-only structure map for this preset.
          </p>
        </div>

        <div className="layer-editor-lock" role="note" aria-live="polite">
          <div className="layer-editor-lock__pill">Locked</div>
          <div className="layer-editor-lock__hint">
            Layer graph controls are currently read-only. Interactive editing is rolling out soon.
          </div>
        </div>

        <div className="layer-editor-list" title="Layer graph editing with reorder, blend routing, and node-level controls is currently in progress.">
          {(layerInfo?.components ?? ['Core Layer', 'Interaction Layer', 'Post Layer']).map((layer) => (
            <div key={`${activeShader.id}-${layer}`} className="layer-editor-item">
              <span className="layer-editor-item__dot" />
              <span className="layer-editor-item__name">{layer}</span>
              <span className="layer-editor-item__state">Read-only</span>
            </div>
          ))}
        </div>
        <div
          className={`ui-cursor-tip ui-cursor-tip--panel ${tip.visible ? 'is-visible' : ''}`}
          role="status"
          style={{
            left: `${tip.x}px`,
            top: `${tip.y}px`,
          }}
        >
          Locked · coming soon
        </div>
      </aside>

      <div className="shader-workbench__right-column">
        <aside className="shader-workbench__panel shader-workbench__panel--right">
          <div className="shader-workbench__panel-head shader-workbench__panel-head--compact">
            <p className="shader-workbench__eyebrow">Shader Studio</p>
            <div className="shader-workbench__meta">
              <span>{`${shaderIndex} / ${shaderTotal}`}</span>
              <span>{activeShader.id}</span>
            </div>
          </div>

          <button type="button" className="shader-reset-button" onClick={onReset}>
            Reset Preset
          </button>

          <div className="shader-workbench__stack">
            {activeShader.mode === 'three-ditherfx-object' ? (
              <section className="control-section">
                <div className="control-section__header">
                  <h3>3D Model</h3>
                </div>
                <div className="control-section__body">
                  <label className="dither-upload">
                    <span className="dither-upload__label">
                      {ditherModelFile ? `Loaded: ${ditherModelFile.name}` : 'Upload GLB/GLTF'}
                    </span>
                    <input
                      className="dither-upload__input"
                      type="file"
                      accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                      onChange={(event) => {
                        const [file] = event.target.files ?? []
                        if (file && onDitherModelUpload) {
                          onDitherModelUpload(file)
                        }
                        event.target.value = ''
                      }}
                    />
                  </label>
                  {ditherModelFile ? (
                    <button
                      type="button"
                      className="shader-reset-button dither-upload__clear"
                      onClick={onDitherModelClear}
                    >
                      Clear Upload
                    </button>
                  ) : null}
                  {ditherModelStatus ? (
                    <p className="dither-upload__status">{ditherModelStatus}</p>
                  ) : null}
                </div>
              </section>
            ) : null}
            {visibleSections.map((section) => (
              <section key={section.title} className="control-section">
                <div className="control-section__header">
                  <h3>{section.title}</h3>
                </div>
                <div className="control-section__body">
                  {section.controls.map((control) => (
                    <ControlField
                      key={control.key}
                      control={control}
                      value={controls[control.key]}
                      onChange={onControlChange}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section className="npm-export-window">
          <div className="control-section__header">
            <h3>NPM Export</h3>
          </div>
          <div className="npm-export-card">
            <pre>{npmSnippet}</pre>
            <button type="button" className="shader-reset-button npm-copy-button" onClick={onCopyNpm}>
              Copy Snippet
            </button>
            <p className="npm-export-status">{npmStatus || 'Package scaffold prepared for @horsestudio/shader-studio'}</p>
          </div>
        </section>
      </div>
    </section>
  )
}

export default ShaderWorkbench
