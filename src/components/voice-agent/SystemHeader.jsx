import { useState } from 'react'
import {
  Cube,
  Cursor,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  ImageSquare,
  LockSimple,
  Sparkle,
  TextT,
} from '@phosphor-icons/react'

const toolItems = [
  { id: 'select', label: 'Select', Icon: Cursor },
  { id: 'frame', label: 'Frame', Icon: SquareIcon },
  { id: 'text', label: 'Type', Icon: TextT },
  { id: 'image', label: 'Image', Icon: ImageSquare },
  { id: 'mesh', label: '3D', Icon: Cube },
  { id: 'spark', label: 'Spark', Icon: Sparkle },
]

function SquareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  )
}

function SystemHeader() {
  const [tip, setTip] = useState({ visible: false, x: 0, y: 0 })

  return (
    <header
      className="studio-toolbar studio-toolbar--locked"
      onMouseMove={(event) => {
        setTip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
        })
      }}
      onMouseLeave={() => setTip((current) => ({ ...current, visible: false }))}
    >
      <div className="studio-toolbar__group studio-toolbar__group--left">
        {toolItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`studio-tool ${index === 0 ? 'studio-tool--active' : ''}`}
            aria-label={item.label}
            disabled
          >
            <item.Icon size={18} weight="regular" />
          </button>
        ))}
      </div>

      <div className="studio-toolbar__group studio-toolbar__group--right">
        <div className="studio-toolbar__chip studio-toolbar__chip--active">
          <Desktop size={16} weight="regular" />
          <span>Desktop</span>
        </div>
        <div className="studio-toolbar__chip studio-toolbar__chip--icon">
          <DeviceMobile size={16} weight="regular" />
        </div>
        <div className="studio-toolbar__chip studio-toolbar__chip--icon">
          <DeviceTablet size={16} weight="regular" />
        </div>
        <div className="studio-toolbar__chip">1440 × 900</div>
        <div className="studio-toolbar__chip">65%</div>
        <div className="studio-toolbar__chip">Scroll</div>
        <div className="studio-toolbar__chip">
          <LockSimple size={14} weight="regular" />
          <span>HD</span>
        </div>
      </div>
      <div
        className={`ui-cursor-tip ${tip.visible ? 'is-visible' : ''}`}
        role="status"
        style={{
          left: `${tip.x}px`,
          top: `${tip.y}px`,
        }}
      >
        Locked · coming soon
      </div>
    </header>
  )
}

export default SystemHeader
