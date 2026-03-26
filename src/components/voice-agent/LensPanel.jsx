const transcriptWords = [
  'Synthesizing',
  'optimal',
  'routing',
  'pathways',
  'across',
  'multichain',
  'networks...',
]

function LensPanel() {
  return (
    <div className="lens-container">
      <div className="glass-panel">
        <div className="panel-header">
          <span>1985.DESIGN</span>
          <span>WEB 3</span>
        </div>

        <div className="transcript-overlay" aria-live="polite">
          {transcriptWords.map((word, index) => (
            <span
              key={word}
              className={`word ${word === 'routing' ? 'shimmer' : ''}`.trim()}
              style={{ animationDelay: `${[0.1, 0.3, 0.5, 0.7, 1.0, 1.2, 1.5][index]}s` }}
            >
              {word}
            </span>
          ))}
        </div>

        <div className="scale-track" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, index) => (
            <div key={`tick-${index + 1}`} className="tick" />
          ))}
          <div className="scale-labels">
            <span>31.847</span>
            <span>97.482</span>
          </div>
        </div>

        <div className="panel-footer">
          <div className="data-block">
            <div className="data-label">1985</div>
            <div className="data-label emphasis">NEURAL SYNTHESIS</div>
            <div className="data-value">N7.Z</div>
            <div className="data-value">0.0491</div>
          </div>
          <div className="big-logo">N7</div>
        </div>
      </div>
    </div>
  )
}

export default LensPanel
