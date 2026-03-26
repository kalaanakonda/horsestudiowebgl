import {
  COMPONENT_FAMILY_META,
  PRESET_COMPONENT_BREAKDOWN,
} from './shaderLibrary'

const familyOrder = Object.keys(COMPONENT_FAMILY_META)

function FamilyPill({ family }) {
  const meta = COMPONENT_FAMILY_META[family]
  if (!meta) return null
  return (
    <span className="genome-family-pill" style={{ '--family-accent': meta.color }}>
      <span className="genome-family-dot" />
      {meta.label}
    </span>
  )
}

function PresetCard({ preset }) {
  const breakdown = PRESET_COMPONENT_BREAKDOWN[preset.id]
  if (!breakdown) return null

  return (
    <article className="genome-card">
      <header className="genome-card__head">
        <p className="genome-card__title">{preset.name}</p>
        <span className="genome-card__mode">{preset.mode}</span>
      </header>
      <p className="genome-card__summary">{breakdown.summary}</p>

      <div className="genome-card__families">
        {breakdown.families.map((family) => (
          <FamilyPill key={`${preset.id}-${family}`} family={family} />
        ))}
      </div>

      <div className="genome-card__components">
        {breakdown.components.map((component) => (
          <span key={`${preset.id}-${component}`} className="genome-component-chip">
            {component}
          </span>
        ))}
      </div>
    </article>
  )
}

function FamilyRail({ presets }) {
  return (
    <section className="genome-rail" aria-label="Component families">
      {familyOrder.map((family) => {
        const meta = COMPONENT_FAMILY_META[family]
        const members = presets
          .filter((preset) => PRESET_COMPONENT_BREAKDOWN[preset.id]?.families.includes(family))
          .map((preset) => preset.name)

        return (
          <div key={family} className="genome-rail__row" style={{ '--family-accent': meta.color }}>
            <div className="genome-rail__label">
              <span className="genome-rail__dot" />
              <span>{meta.label}</span>
            </div>
            <div className="genome-rail__members">
              {members.map((name) => (
                <span key={`${family}-${name}`} className="genome-rail__member">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function PresetGenomeStudio({ presets, onClose }) {
  return (
    <section className="genome-studio" aria-label="Preset genome studio">
      <div className="genome-studio__topbar">
        <div>
          <p className="genome-studio__eyebrow">Education Mode</p>
          <h2 className="genome-studio__title">Preset Genome Atlas</h2>
          <p className="genome-studio__subtitle">
            Deconstructed families and reusable components across all {presets.length} presets.
          </p>
        </div>
        <button type="button" className="genome-studio__close" onClick={onClose}>
          Close Atlas
        </button>
      </div>

      <FamilyRail presets={presets} />

      <div className="genome-grid">
        {presets.map((preset) => (
          <PresetCard key={preset.id} preset={preset} />
        ))}
      </div>
    </section>
  )
}

export default PresetGenomeStudio
