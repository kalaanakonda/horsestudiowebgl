function VoiceFooter({
  shaderName,
  shaderIndex,
  shaderTotal,
  onPrevShader,
  onNextShader,
}) {
  return (
    <footer className="voice-footer">
      <div className="shader-switcher" aria-label="Shader switcher">
        <button
          type="button"
          className="shader-nav-button"
          onClick={onPrevShader}
          aria-label="Previous shader"
        >
          ←
        </button>
        <div className="shader-meta">
          <span className="shader-meta__label">BACKGROUND</span>
          <span className="shader-meta__name">{shaderName}</span>
          <span className="shader-meta__count">{`${shaderIndex} / ${shaderTotal}`}</span>
        </div>
        <button
          type="button"
          className="shader-nav-button"
          onClick={onNextShader}
          aria-label="Next shader"
        >
          →
        </button>
      </div>
    </footer>
  )
}

export default VoiceFooter
