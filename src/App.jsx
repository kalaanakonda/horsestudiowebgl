import { useCallback, useEffect, useState } from 'react'
import './App.css'
import VoiceAgentView from './views/VoiceAgentView'
import GenomePlaygroundView from './views/GenomePlaygroundView'
import WebGLMixerView from './views/WebGLMixerView'

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const onNavigate = useCallback((path) => {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    setPathname(path)
  }, [])

  const isVoiceAgentRoute = pathname === '/' || pathname === '/voice-agent'
  const isGenomeRoute = pathname === '/genome-playground'
  const isMixerRoute = pathname === '/mixer-studio'
  const isFullScreenRoute = isVoiceAgentRoute || isGenomeRoute || isMixerRoute

  return (
    <div className={`app-shell ${isFullScreenRoute ? 'app-shell--voice' : ''}`}>
      {isVoiceAgentRoute ? (
        <VoiceAgentView onNavigate={onNavigate} />
      ) : isGenomeRoute ? (
        <GenomePlaygroundView onNavigate={onNavigate} />
      ) : isMixerRoute ? (
        <WebGLMixerView onNavigate={onNavigate} />
      ) : (
        <VoiceAgentView onNavigate={onNavigate} />
      )}
    </div>
  )
}

export default App
