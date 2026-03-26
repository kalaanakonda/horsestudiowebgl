import { useCallback, useEffect, useMemo, useState } from 'react'
import AuroraBackground from '../components/voice-agent/AuroraBackground'
import ShaderWorkbench from '../components/voice-agent/ShaderWorkbench'
import {
  DEFAULT_SHADER_ID,
  getShaderDefaultControls,
  SHADER_LIBRARY,
} from '../components/voice-agent/shaderLibrary'
import SystemHeader from '../components/voice-agent/SystemHeader'
import VoiceFooter from '../components/voice-agent/VoiceFooter'

function withCenteredBase(controls) {
  return {
    ...controls,
    positionX: 0,
    positionY: 0,
    cursorOffsetX: 0,
    cursorOffsetY: 0,
  }
}

function getBaseControlsForShader(shaderId) {
  return withCenteredBase(getShaderDefaultControls(shaderId))
}

function VoiceAgentView() {
  const [activeShaderIndex, setActiveShaderIndex] = useState(
    Math.max(
      0,
      SHADER_LIBRARY.findIndex((shader) => shader.id === DEFAULT_SHADER_ID),
    ),
  )
  const [controlsByShader, setControlsByShader] = useState(() =>
    Object.fromEntries(
      SHADER_LIBRARY.map((shader) => [shader.id, getBaseControlsForShader(shader.id)]),
    ),
  )
  const [ditherModelFile, setDitherModelFile] = useState(null)
  const [ditherModelStatus, setDitherModelStatus] = useState('')
  const activeShader = useMemo(
    () => SHADER_LIBRARY[activeShaderIndex] ?? SHADER_LIBRARY[0],
    [activeShaderIndex],
  )
  const activeControls = controlsByShader[activeShader.id] ?? getBaseControlsForShader(activeShader.id)
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

  const onPrevShader = useCallback(() => {
    setActiveShaderIndex((current) => (current - 1 + SHADER_LIBRARY.length) % SHADER_LIBRARY.length)
  }, [])

  const onNextShader = useCallback(() => {
    setActiveShaderIndex((current) => (current + 1) % SHADER_LIBRARY.length)
  }, [])
  const onControlChange = useCallback((key, value) => {
    setControlsByShader((current) => ({
      ...current,
      [activeShader.id]: {
        ...current[activeShader.id],
        [key]: value,
      },
    }))
  }, [activeShader.id])
  const onReset = useCallback(() => {
    setControlsByShader((current) => ({
      ...current,
      [activeShader.id]: getBaseControlsForShader(activeShader.id),
    }))
  }, [activeShader.id])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') {
        onPrevShader()
      }
      if (event.key === 'ArrowRight') {
        onNextShader()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNextShader, onPrevShader])

  useEffect(() => {
    setControlsByShader((current) => ({
      ...current,
      [activeShader.id]: withCenteredBase({
        ...(current[activeShader.id] ?? getBaseControlsForShader(activeShader.id)),
      }),
    }))
  }, [activeShader.id])

  return (
    <main className="voice-agent-screen">
      <AuroraBackground
        shaderId={activeShader.id}
        controls={activeControls}
        ditherModelFile={ditherModelFile}
        onDitherModelStatusChange={setDitherModelStatus}
      />
      {noiseOverlayStyle ? <div className="noise-overlay" style={noiseOverlayStyle} aria-hidden="true" /> : null}
      {vignetteOverlayStyle ? <div className="vignette-overlay" style={vignetteOverlayStyle} aria-hidden="true" /> : null}

      <div id="ui-layer">
        <SystemHeader />
        <ShaderWorkbench
          activeShader={activeShader}
          controls={activeControls}
          onControlChange={onControlChange}
          onReset={onReset}
          shaderIndex={activeShaderIndex + 1}
          shaderTotal={SHADER_LIBRARY.length}
          ditherModelFile={ditherModelFile}
          ditherModelStatus={ditherModelStatus}
          onDitherModelUpload={(file) => {
            setDitherModelStatus('Loading model...')
            setDitherModelFile(file)
          }}
          onDitherModelClear={() => {
            setDitherModelFile(null)
            setDitherModelStatus('')
          }}
        />
        <VoiceFooter
          shaderName={activeShader.name}
          shaderIndex={activeShaderIndex + 1}
          shaderTotal={SHADER_LIBRARY.length}
          onPrevShader={onPrevShader}
          onNextShader={onNextShader}
        />
      </div>
    </main>
  )
}

export default VoiceAgentView
