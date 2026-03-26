import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DEFAULT_SHADER_CONTROLS, SHADER_LIBRARY, vertexShader } from './shaderLibrary'

function getShaderConfig(shaderId) {
  return SHADER_LIBRARY.find((shader) => shader.id === shaderId) ?? SHADER_LIBRARY[0]
}

function getShapeMask(shapePreset, vignette) {
  if (shapePreset === 'orb') {
    return `radial-gradient(circle at center, rgba(0,0,0,1) ${28 + vignette * 18}%, rgba(0,0,0,0) ${72 + vignette * 12}%)`
  }
  if (shapePreset === 'slit') {
    return 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,1) 38%, rgba(0,0,0,1) 62%, transparent 100%)'
  }
  if (shapePreset === 'ribbon') {
    return 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,1) 28%, rgba(0,0,0,1) 72%, transparent 100%)'
  }
  if (shapePreset === 'shard') {
    return 'polygon(12% 0%, 100% 0%, 82% 100%, 0% 100%)'
  }
  return null
}

function applyEffectPresentation(element, controls, viewport) {
  const translateX = controls.positionX * viewport.width * 0.18
  const translateY = controls.positionY * viewport.height * 0.18
  const finalScale = controls.effectSize
  element.style.transform = `translate(${translateX}px, ${translateY}px) scale(${finalScale}) rotate(${controls.rotation}deg)`
  element.style.transformOrigin = '50% 50%'
  element.style.opacity = `${controls.opacity}`
  element.style.filter = `blur(${controls.blur}px) brightness(${controls.brightness}) contrast(${controls.contrast}) saturate(${controls.saturation}) hue-rotate(${controls.hueShift}deg)`

  const mask = getShapeMask(controls.shapePreset, controls.vignette)
  if (controls.shapePreset === 'shard' && mask) {
    element.style.clipPath = mask
    element.style.maskImage = ''
    element.style.webkitMaskImage = ''
  } else if (mask) {
    element.style.maskImage = mask
    element.style.webkitMaskImage = mask
    element.style.clipPath = ''
  } else {
    element.style.maskImage = ''
    element.style.webkitMaskImage = ''
    element.style.clipPath = ''
  }
}

function mapClientToEffectSpace(clientX, clientY, controls, viewport) {
  const cx = viewport.width * 0.5
  const cy = viewport.height * 0.5
  const tx = controls.positionX * viewport.width * 0.18
  const ty = controls.positionY * viewport.height * 0.18
  const scale = Math.max(0.0001, controls.effectSize)
  const angle = (controls.rotation * Math.PI) / 180

  const px = clientX - cx - tx
  const py = clientY - cy - ty

  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)

  // Inverse rotate and inverse scale to map screen coordinates into transformed effect space.
  const rx = (px * cosA + py * sinA) / scale
  const ry = (-px * sinA + py * cosA) / scale

  return { x: rx + cx, y: ry + cy }
}

function hexToRgb01(hex) {
  const clean = `${hex}`.replace('#', '')
  if (clean.length !== 6) return { r: 1, g: 1, b: 1 }
  const int = Number.parseInt(clean, 16)
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  }
}

function colorDistance01(aHex, bHex) {
  const a = hexToRgb01(aHex)
  const b = hexToRgb01(bHex)
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  // Normalized euclidean distance in RGB space.
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3)
}

function withGlobalZoom(fragmentShader) {
  if (!fragmentShader.includes('u_resolution')) return fragmentShader

  let output = fragmentShader
  if (!output.includes('uniform float u_zoom;')) {
    output = output.replace(
      /uniform vec2 u_resolution;\s*/m,
      (match) => `${match}uniform float u_zoom;\n`,
    )
  }
  if (!output.includes('uniform float u_curveAmount;')) {
    output = output.replace(
      /uniform float u_zoom;\s*/m,
      (match) => `${match}uniform float u_curveAmount;\nuniform float u_turbulenceAmount;\nuniform float u_grainAmount;\nuniform float u_paletteMix;\nuniform vec3 u_colorA;\nuniform vec3 u_colorB;\nuniform vec3 u_colorC;\n`,
    )
  }

  output = output.replace(
    /vec2 uv = gl_FragCoord\.xy \/ u_resolution\.xy;\s*/g,
    (match) => `${match}uv = (uv - vec2(0.5)) / max(u_zoom, 0.0001) + vec2(0.5);\nvec2 _uvWarp = uv - vec2(0.5);\nfloat _uvLen = length(_uvWarp);\nuv += _uvWarp * (_uvLen * _uvLen) * (u_curveAmount * 0.18);\nuv += vec2(sin((uv.y + u_time * 0.15) * 18.0), cos((uv.x - u_time * 0.12) * 16.0)) * (u_turbulenceAmount * 0.02);\n`,
  )

  output = output.replace(
    /vec2 st = gl_FragCoord\.xy \/ u_resolution\.xy;\s*/g,
    (match) => `${match}st = (st - vec2(0.5)) / max(u_zoom, 0.0001) + vec2(0.5);\nvec2 _stWarp = st - vec2(0.5);\nfloat _stLen = length(_stWarp);\nst += _stWarp * (_stLen * _stLen) * (u_curveAmount * 0.18);\nst += vec2(sin((st.y + u_time * 0.15) * 18.0), cos((st.x - u_time * 0.12) * 16.0)) * (u_turbulenceAmount * 0.02);\n`,
  )

  output = output.replace(
    /gl_FragColor\s*=\s*vec4\(([^;]+)\);/g,
    (match, expr) => `{
  vec4 _hsOut = vec4(${expr});
  float _hsLum = dot(_hsOut.rgb, vec3(0.299, 0.587, 0.114));
  vec3 _hsPalette = mix(u_colorA, u_colorB, smoothstep(0.08, 0.62, _hsLum));
  _hsPalette = mix(_hsPalette, u_colorC, smoothstep(0.62, 1.0, _hsLum));
  _hsOut.rgb = mix(_hsOut.rgb, _hsPalette, clamp(u_paletteMix, 0.0, 1.0));
  float _hsNoise = fract(sin(dot(gl_FragCoord.xy + u_time * 10.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  _hsOut.rgb += _hsNoise * (0.02 * u_grainAmount);
  gl_FragColor = _hsOut;
}`,
  )

  return output
}

function AuroraBackground({
  shaderId,
  controls,
  ditherModelFile = null,
  onDitherModelStatusChange = null,
}) {
  const containerRef = useRef(null)
  const controlsRef = useRef(controls)

  const mouseTargetRef = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseDirRef = useRef(new THREE.Vector2(1.0, 0.0))
  const prevMouseRef = useRef(new THREE.Vector2(0.5, 0.5))
  const trailRef = useRef(new THREE.Vector2(0.5, 0.5))
  const speedRef = useRef(0.0)

  const shaderConfig = useMemo(() => getShaderConfig(shaderId), [shaderId])
  const isLedMode = shaderConfig.mode === 'canvas2d-led'
  const isRippedAsciiMode = shaderConfig.mode === 'canvas2d-ripped-ascii'
  const isShaderMode = !isLedMode && !isRippedAsciiMode
  const isMeditativeMode = shaderConfig.mode === 'three-meditative-ripples'
  const isDisplacementBlobMode = shaderConfig.mode === 'three-displacement-blob'
  const isDitherFxMode = shaderConfig.mode === 'three-ditherfx-object'
  const isNebulaMode = shaderConfig.mode === 'three-nebula'
  const isReactantFieldMode = shaderConfig.mode === 'webgl2-reactant-field'
  const isDisturbance = shaderConfig.id === 'prismatic-disturbance'
  const mouseLerp = shaderConfig.mouseLerp ?? 0.08

  useEffect(() => {
    controlsRef.current = controls
  }, [controls])

  useEffect(() => {
    mouseTargetRef.current.set(0.5, 0.5)
    prevMouseRef.current.set(0.5, 0.5)
    trailRef.current.set(0.5, 0.5)
    mouseDirRef.current.set(1.0, 0.0)
    speedRef.current = 0.0
  }, [shaderId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let hasInteracted = false

    if (isLedMode || isRippedAsciiMode) {
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      container.appendChild(canvas)

      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return undefined

      if (isLedMode) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const spacing = 6
        const damping = 0.94

        let width = 0
        let height = 0
        let cols = 0
        let rows = 0
        let buf1 = new Float32Array(0)
        let buf2 = new Float32Array(0)
        let animationFrameId = 0
        let time = 0

        let mouseX = 0
        let mouseY = 0
        let targetMouseX = 0
        let targetMouseY = 0
        let isHovering = false

        const rebuild = () => {
          width = window.innerWidth
          height = window.innerHeight
          canvas.width = Math.floor(width * dpr)
          canvas.height = Math.floor(height * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

          cols = Math.max(2, Math.floor(width / spacing))
          rows = Math.max(2, Math.floor(height / spacing))
          buf1 = new Float32Array(cols * rows)
          buf2 = new Float32Array(cols * rows)

          mouseX = targetMouseX = width * 0.5
          mouseY = targetMouseY = height * 0.5
        }

        const onPointerMove = (event) => {
          const nextControls = controlsRef.current
          const mapped = mapClientToEffectSpace(
            event.clientX,
            event.clientY,
            nextControls,
            { width, height },
          )
          const movement = nextControls.cursorMovement
          const offsetX = nextControls.cursorOffsetX * width
          const offsetY = nextControls.cursorOffsetY * height
          targetMouseX = width * 0.5 + (mapped.x - width * 0.5) * movement + offsetX
          targetMouseY = height * 0.5 + (mapped.y - height * 0.5) * movement - offsetY
          isHovering = true
        }

        const onPointerEnter = () => {
          const nextControls = controlsRef.current
          mouseX = targetMouseX = width * 0.5 + nextControls.cursorOffsetX * width
          mouseY = targetMouseY = height * 0.5 - nextControls.cursorOffsetY * height
          isHovering = true
        }

        const onPointerLeave = () => {
          isHovering = false
        }

        const animate = () => {
          animationFrameId = window.requestAnimationFrame(animate)
          const nextControls = controlsRef.current

          mouseX += (targetMouseX - mouseX) * 0.3
          mouseY += (targetMouseY - mouseY) * 0.3
          applyEffectPresentation(canvas, nextControls, { width, height })

          if (isHovering) {
            const gx = Math.floor(mouseX / spacing)
            const gy = Math.floor(mouseY / spacing)
            const brushRadius = 2.5 * nextControls.cursorSize
            const brushCeil = Math.ceil(brushRadius)

            for (let x = -brushCeil; x <= brushCeil; x += 1) {
              for (let y = -brushCeil; y <= brushCeil; y += 1) {
                if (x * x + y * y <= brushRadius * brushRadius) {
                  const cx = gx + x
                  const cy = gy + y
                  if (cx > 0 && cx < cols - 1 && cy > 0 && cy < rows - 1) {
                    const idx = cy * cols + cx
                    const dist = Math.sqrt(x * x + y * y)
                    const force = (1 - dist / brushRadius) * 400 * nextControls.cursorReaction
                    buf1[idx] += force
                  }
                }
              }
            }
          } else if (Math.random() < 0.1) {
            const rx = Math.floor(Math.random() * (cols - 2)) + 1
            const ry = Math.floor(Math.random() * (rows - 2)) + 1
            buf1[ry * cols + rx] += 150
          }

          for (let i = 1; i < cols - 1; i += 1) {
            for (let j = 1; j < rows - 1; j += 1) {
              const idx = j * cols + i
              buf2[idx] = (
                buf1[(j - 1) * cols + i] +
                buf1[(j + 1) * cols + i] +
                buf1[j * cols + i - 1] +
                buf1[j * cols + i + 1]
              ) / 2 - buf2[idx]
              buf2[idx] *= damping
            }
          }

          ctx.fillStyle = '#030305'
          ctx.fillRect(0, 0, width, height)
          time += 0.04 * nextControls.speed

          for (let j = 0; j < rows; j += 1) {
            for (let i = 0; i < cols; i += 1) {
              const idx = j * cols + i
              const ripple = buf2[idx]
              const absRipple = Math.abs(ripple)

              const nx = i * 0.08
              const ny = j * 0.08
              const wave1 = Math.sin(nx + time * 0.6) * Math.cos(ny - time * 0.4)
              const wave2 = Math.sin(nx * 0.5 - time * 0.3 + ny * 0.8)
              const ambientWave = (wave1 + wave2 + 2) / 4
              const ambient = ambientWave ** (1.6 + nextControls.curves)

              const xPos = i * spacing + spacing / 2
              const yPos = j * spacing + spacing / 2
              let size = 0.8 + ambient * 1.2

              if (absRipple > 5) {
                const hue = (time * 30 + i * 2 + j * 2 + absRipple + nextControls.hueShift) % 360
                const lightness = Math.min(85, 30 + absRipple * 0.5 + nextControls.brightness * 10)
                const saturation = Math.min(100, 50 + absRipple + nextControls.saturation * 10)
                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`
                size = 1.2 + Math.min(2, absRipple / 30)

                if (absRipple > 20) {
                  ctx.shadowBlur = Math.min(10, absRipple / 5)
                  ctx.shadowColor = `hsl(${hue}, 100%, 60%)`
                } else {
                  ctx.shadowBlur = 0
                }
              } else {
                const intensity = Math.floor(20 + ambient * 235)
                const blueTint = Math.floor(40 + ambient * 215)
                ctx.fillStyle = `rgb(${intensity - 10}, ${intensity}, ${blueTint})`
                ctx.shadowBlur = 0
              }

              ctx.beginPath()
              ctx.arc(xPos, yPos, size, 0, Math.PI * 2)
              ctx.fill()
            }
          }

          ctx.shadowBlur = 0

          const tmp = buf1
          buf1 = buf2
          buf2 = tmp
        }

        rebuild()
        animate()
        window.addEventListener('resize', rebuild)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerenter', onPointerEnter)
        window.addEventListener('pointerleave', onPointerLeave)

        return () => {
          window.removeEventListener('resize', rebuild)
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerenter', onPointerEnter)
          window.removeEventListener('pointerleave', onPointerLeave)
          window.cancelAnimationFrame(animationFrameId)
          if (container.contains(canvas)) {
            container.removeChild(canvas)
          }
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const WAVE_CHARS = ' .,;:!|/\\-_~^`'.split('')
      const GLITCH_CHARS = '/\\|!?;:.,+=-~^'.split('')
      const rgbCols = ['#331111', '#113311', '#111133']
      const cols = 120
      const radius = 140
      let rows = 0
      let cellW = 0
      let cellH = 0
      let width = 0
      let height = 0
      let time = 0
      let animationFrameId = 0
      let accentTimer = 0
      let rgbAccents = []
      let glitchStrip = []
      const mouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, vx: 0, vy: 0 }
      const lastMouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }
      let zoomCurrent = 1
      let zoomTarget = 1
      let speedCurrent = 1
      let speedTarget = 1

      const waveAmp = (x, l, t, speed) => {
        const nx = x / cols
        return (
          0.22 * Math.sin(nx * 5.8 + t * 1.05 * speed + l * 1.1) +
          0.13 * Math.sin(nx * 13.7 - t * 1.55 * speed + l * 2.3) +
          0.08 * Math.sin(nx * 27.2 + t * 2.15 * speed - l * 0.6) +
          0.05 * Math.sin(nx * 51.0 - t * 2.9 * speed + l * 3.8)
        )
      }

      const tearNoise = (x, y, t) => {
        return Math.sin(x * 0.06 + t * 0.9) * 0.55 + Math.sin(y * 0.19 - t * 1.2) * 0.45
      }

      const rebuild = () => {
        width = window.innerWidth
        height = window.innerHeight
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        cellW = width / cols
        cellH = cellW * 1.55
        rows = Math.ceil(height / cellH)
        mouse.x = width * 0.5
        mouse.y = height * 0.5
        lastMouse.x = width * 0.5
        lastMouse.y = height * 0.5
      }

      const onPointerMove = (event) => {
        const nextControls = controlsRef.current
        const mapped = mapClientToEffectSpace(
          event.clientX,
          event.clientY,
          nextControls,
          { width, height },
        )
        mouse.vx = mapped.x - lastMouse.x
        mouse.vy = mapped.y - lastMouse.y
        mouse.x = (mapped.x - width * 0.5) * nextControls.cursorMovement + width * 0.5 + nextControls.cursorOffsetX * width
        mouse.y = (mapped.y - height * 0.5) * nextControls.cursorMovement + height * 0.5 - nextControls.cursorOffsetY * height
        lastMouse.x = mapped.x
        lastMouse.y = mapped.y
        zoomTarget = 1 + (nextControls.effectSize - 1) * 0.12
        speedTarget = 0.7 + nextControls.cursorReaction * 0.5
      }

      const onPointerLeave = () => {
        mouse.x = width * 0.5
        mouse.y = height * 0.5
        zoomTarget = 1
        speedTarget = 0.9
      }

        const animate = () => {
          animationFrameId = window.requestAnimationFrame(animate)
          const nextControls = controlsRef.current

          zoomCurrent += (zoomTarget - zoomCurrent) * 0.04
          speedCurrent += (speedTarget - speedCurrent) * 0.04
          time += 0.012 * speedCurrent * nextControls.speed
          applyEffectPresentation(canvas, nextControls, { width, height })

          accentTimer += 1
          if (accentTimer % Math.max(6, Math.round(18 - nextControls.turbulence * 8)) === 0) {
          rgbAccents.push({
            cx: Math.floor(Math.random() * cols),
            cy: Math.floor(Math.random() * rows * 0.8 + rows * 0.1),
            col: rgbCols[Math.floor(Math.random() * 3)],
            life: 0,
            maxLife: 20,
          })
          if (rgbAccents.length > 10) rgbAccents.shift()
        }
        rgbAccents = rgbAccents
          .map((accent) => ({ ...accent, life: accent.life + 1 }))
          .filter((accent) => accent.life < accent.maxLife)

          glitchStrip = Math.random() < (0.04 + nextControls.turbulence * 0.14)
          ? [{ row: Math.floor(Math.random() * rows), shift: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.floor(Math.random() * 3)) }]
          : []

        const velMag = Math.hypot(mouse.vx, mouse.vy)
        const charSize = Math.max(8, Math.round(cellH * 0.7))
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, width, height)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.font = `${charSize}px "JetBrains Mono", monospace`

        const cx0 = width / 2
        const cy0 = height / 2
        ctx.save()
        ctx.translate(cx0, cy0)
        ctx.scale(zoomCurrent, zoomCurrent)
        ctx.translate(-cx0, -cy0)

        for (let row = 0; row < rows; row += 1) {
          const strip = glitchStrip.find((item) => item.row === row)
          const colShift = strip ? strip.shift : 0
          const band = Math.floor((row / rows) * 5)
          const bandH = rows / 5
          const bandT = (row % bandH) / bandH

          for (let col = 0; col < cols; col += 1) {
            const px = (col + colShift) * cellW + cellW / 2
            const py = row * cellH + cellH / 2
            const dx = px - mouse.x / zoomCurrent
            const dy = py - mouse.y / zoomCurrent
            const dist = Math.hypot(dx, dy)
            const affected = dist < radius * nextControls.cursorSize

            const amp = waveAmp(col, band, time, speedCurrent) * (0.8 + nextControls.curves * 0.8)
            const center = 0.5 + amp
            const distToCenter = Math.abs(bandT - center)
            const waveDensity = Math.exp(-distToCenter * distToCenter / (0.2 * 0.2 * 0.55))

            const tear = tearNoise(col, row, time)
            const tearThreshold = 0.18 + 0.12 * Math.sin(row * 0.08 + time * 0.6)
            const ripped = tear > (tearThreshold - nextControls.turbulence * 0.12) && waveDensity > (0.18 - nextControls.softness * 0.08)

            const charIdx = Math.floor(waveDensity * (WAVE_CHARS.length - 1))
            let char = WAVE_CHARS[Math.min(charIdx, WAVE_CHARS.length - 1)]
            let opacity = waveDensity * 0.72
            let renderX = px
            let renderY = py

            if (ripped) {
              char = GLITCH_CHARS[(col + row + Math.floor(time * 10)) % GLITCH_CHARS.length]
              opacity *= 0.4 + nextControls.opacity * 0.35
              renderX += Math.sin(row * 0.21 + time * 2.1) * (2.6 + nextControls.turbulence * 4.0)
              renderY += Math.cos(col * 0.12 - time * 1.7) * (1.6 + nextControls.turbulence * 3.0)
            }

            if (affected) {
              const f = ((radius * nextControls.cursorSize) - dist) / (radius * nextControls.cursorSize)
              renderX += (dx / (dist || 1)) * f * 14 * nextControls.cursorReaction
              renderY += (dy / (dist || 1)) * f * 14 * nextControls.cursorReaction
              opacity = Math.min(1, opacity + f * 0.4 * nextControls.cursorReaction)
              if (velMag > 5) {
                char = Math.random() > 0.5 ? '/' : '\\'
              }
            }

            const accent = rgbAccents.find((item) => item.cx === col && item.cy === row)
            if (accent) {
              const t01 = accent.life / accent.maxLife
              const alpha = Math.sin(t01 * Math.PI) * 0.72
              const r = parseInt(accent.col.slice(1, 3), 16)
              const g = parseInt(accent.col.slice(3, 5), 16)
              const b = parseInt(accent.col.slice(5, 7), 16)
              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * nextControls.opacity})`
              ctx.fillText(char || '.', renderX, renderY)
            } else if (char && char !== ' ' && opacity > 0.04) {
              ctx.fillStyle = `rgba(232, 230, 224, ${opacity * nextControls.opacity})`
              ctx.fillText(char, renderX, renderY)
            }
          }
        }

        ctx.restore()
      }

      rebuild()
      animate()
      window.addEventListener('resize', rebuild)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerleave', onPointerLeave)

      return () => {
        window.removeEventListener('resize', rebuild)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerleave', onPointerLeave)
        window.cancelAnimationFrame(animationFrameId)
        if (container.contains(canvas)) {
          container.removeChild(canvas)
        }
      }
    }

    if (isMeditativeMode) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      container.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#e6ebf0')
      scene.fog = new THREE.FogExp2('#d8e2ea', 0.03)

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
      camera.position.set(0, 3.5, 9)
      camera.lookAt(0, -0.5, 0)

      const clock = new THREE.Clock()
      const dropsData = new Float32Array(15 * 3)
      let currentDropIndex = 0
      let lastDropTime = 0
      let lastClientX = null
      let lastClientY = null

      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      const light1 = new THREE.DirectionalLight(0xffddf4, 2.5)
      light1.position.set(5, 8, 3)
      scene.add(light1)
      const light2 = new THREE.DirectionalLight(0xddf4ff, 2.5)
      light2.position.set(-5, 8, -3)
      scene.add(light2)
      const light3 = new THREE.DirectionalLight(0xffffff, 1.5)
      light3.position.set(0, 10, 5)
      scene.add(light3)

      const pmremGenerator = new THREE.PMREMGenerator(renderer)
      pmremGenerator.compileEquirectangularShader()
      const envScene = new THREE.Scene()
      envScene.background = new THREE.Color('#e0e8ef')
      const envLight = new THREE.DirectionalLight(0xffffff, 2)
      envLight.position.set(0, 1, 0)
      envScene.add(envLight)
      const renderTarget = pmremGenerator.fromScene(envScene)

      const sphereGeo = new THREE.IcosahedronGeometry(0.6, 10)
      const sphereMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 1.0,
        ior: 1.45,
        thickness: 0.5,
        envMap: renderTarget.texture,
        envMapIntensity: 1.2,
        iridescence: 1.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
        transparent: true,
        opacity: 1.0,
      })
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      sphere.position.set(0, 1.8, 0)
      scene.add(sphere)

      const planeSize = 30
      const waterGeo = new THREE.PlaneGeometry(planeSize, planeSize, 220, 220)
      waterGeo.rotateX(-Math.PI / 2)
      const waterMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDrops: { value: dropsData },
          uCameraPos: { value: camera.position },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          void main() {
            vUv = uv;
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uDrops[45];
          uniform vec3 uCameraPos;
          varying vec2 vUv;
          varying vec3 vWorldPosition;

          float getHeight(vec2 uv, float time) {
            float height = 0.0;
            float distC = length(uv - vec2(0.5));
            height += sin(distC * 30.0 - time * 1.5) * exp(-distC * 4.0) * 0.015;
            for (int i = 0; i < 15; i++) {
              float dropTime = uDrops[i * 3 + 2];
              if (dropTime > 0.0) {
                float age = time - dropTime;
                if (age > 0.0 && age < 6.0) {
                  vec2 dropPos = vec2(uDrops[i * 3], uDrops[i * 3 + 1]);
                  float dist = length(uv - dropPos);
                  float attack = smoothstep(0.0, 0.12, age);
                  float wave = sin(dist * 38.0 - age * 9.0);
                  float damp = exp(-dist * 9.5) * exp(-age * 1.0);
                  height += wave * damp * 0.018 * attack;
                }
              }
            }
            return height;
          }

          void main() {
            float epsilon = 0.0035;
            float h0 = getHeight(vUv, uTime);
            float hX = getHeight(vUv + vec2(epsilon, 0.0), uTime);
            float hY = getHeight(vUv + vec2(0.0, epsilon), uTime);
            float dx = (hX - h0) / epsilon;
            float dy = (hY - h0) / epsilon;
            vec3 normal = normalize(vec3(-dx * 0.28, 1.0, -dy * 0.28));

            vec3 viewDir = normalize(uCameraPos - vWorldPosition);
            vec3 reflectDir = reflect(-viewDir, normal);
            float yMix = clamp(reflectDir.y, 0.0, 1.0);
            vec3 skyGradient = mix(vec3(0.75, 0.82, 0.88), vec3(0.98, 0.99, 1.0), pow(yMix, 0.6));
            float rim = 1.0 - max(dot(viewDir, normal), 0.0);
            vec3 iridescence = vec3(
              sin(rim * 3.0 + uTime * 0.5) * 0.5 + 0.5,
              sin(rim * 4.0 + uTime * 0.6 + 2.0) * 0.5 + 0.5,
              sin(rim * 5.0 + uTime * 0.7 + 4.0) * 0.5 + 0.5
            ) * 0.05 * rim;

            vec3 sunDir = normalize(vec3(0.2, 0.8, 0.5));
            float specAngle = max(dot(reflect(-sunDir, normal), viewDir), 0.0);
            float specular = pow(specAngle, 128.0) * 0.8;
            vec3 finalColor = skyGradient + specular + iridescence;
            finalColor *= mix(0.85, 1.05, h0 * 40.0 + 0.5);

            float distFromCenter = length(vWorldPosition.xz);
            float alpha = 1.0 - smoothstep(8.0, 14.0, distFromCenter);
            gl_FragColor = vec4(finalColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
      })
      const water = new THREE.Mesh(waterGeo, waterMat)
      scene.add(water)

      const vignetteBlurShader = {
        uniforms: {
          tDiffuse: { value: null },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uMaxBlur: { value: 3.5 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uMaxBlur;
          varying vec2 vUv;
          void main() {
            vec2 center = vec2(0.5, 0.5);
            vec2 offset = vUv - center;
            offset.y *= 1.2;
            float dist = length(offset);
            float blurStrength = smoothstep(0.3, 0.85, dist) * uMaxBlur;
            vec4 color = vec4(0.0);
            vec2 texelSize = 1.0 / uResolution;
            color += texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(0.0, -1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(-1.0, 0.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv) * 5.0;
            color += texture2D(tDiffuse, vUv + vec2(1.0, 0.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(0.0, 1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(-2.0, -2.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(2.0, -2.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(-2.0, 2.0) * texelSize * blurStrength);
            color += texture2D(tDiffuse, vUv + vec2(2.0, 2.0) * texelSize * blurStrength);
            gl_FragColor = color / 17.0;
          }
        `,
      }

      const composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const blurPass = new ShaderPass(vignetteBlurShader)
      composer.addPass(blurPass)

      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const intersectionPoint = new THREE.Vector3()

      const stampDrop = (clientX, clientY, bypassTimeGate = false) => {
        const now = clock.getElapsedTime()
        if (!bypassTimeGate && now - lastDropTime < 0.02) return false

        const mapped = mapClientToEffectSpace(
          clientX,
          clientY,
          controlsRef.current,
          { width: window.innerWidth, height: window.innerHeight },
        )
        mouse.x = (mapped.x / window.innerWidth) * 2 - 1
        mouse.y = -(mapped.y / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(mouse, camera)

        if (!raycaster.ray.intersectPlane(raycastPlane, intersectionPoint)) return false

        const uvX = (intersectionPoint.x + planeSize / 2) / planeSize
        const uvY = (-intersectionPoint.z + planeSize / 2) / planeSize

        if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) return false

        dropsData[currentDropIndex * 3] = uvX
        dropsData[currentDropIndex * 3 + 1] = uvY
        dropsData[currentDropIndex * 3 + 2] = now
        currentDropIndex = (currentDropIndex + 1) % 15
        waterMat.uniforms.uDrops.value = dropsData
        lastDropTime = now
        return true
      }

      const addDropTrail = (clientX, clientY, burst = 1) => {
        if (lastClientX == null || lastClientY == null) {
          lastClientX = clientX
          lastClientY = clientY
        }

        const dx = clientX - lastClientX
        const dy = clientY - lastClientY
        const dist = Math.hypot(dx, dy)
        const steps = Math.min(4, Math.max(1, Math.ceil(dist / 14)))

        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps
          const ix = lastClientX + dx * t
          const iy = lastClientY + dy * t
          stampDrop(ix, iy, step < steps)
        }

        for (let b = 1; b < burst; b += 1) {
          stampDrop(clientX, clientY, true)
        }

        lastClientX = clientX
        lastClientY = clientY
      }

      const onPointerMove = (event) => {
        const nextControls = controlsRef.current
        addDropTrail(
          event.clientX + nextControls.cursorOffsetX * window.innerWidth * 0.35,
          event.clientY - nextControls.cursorOffsetY * window.innerHeight * 0.35,
          Math.max(1, Math.round(nextControls.cursorReaction)),
        )
      }
      const onPointerDown = (event) => {
        const nextControls = controlsRef.current
        addDropTrail(
          event.clientX + nextControls.cursorOffsetX * window.innerWidth * 0.35,
          event.clientY - nextControls.cursorOffsetY * window.innerHeight * 0.35,
          Math.max(2, Math.round(2 + nextControls.cursorReaction)),
        )
      }
      const onTouchMove = (event) => {
        if (event.touches.length > 0) {
          event.preventDefault()
          const nextControls = controlsRef.current
          addDropTrail(
            event.touches[0].clientX + nextControls.cursorOffsetX * window.innerWidth * 0.35,
            event.touches[0].clientY - nextControls.cursorOffsetY * window.innerHeight * 0.35,
            Math.max(1, Math.round(nextControls.cursorReaction)),
          )
        }
      }
      const onPointerLeave = () => {
        lastClientX = null
        lastClientY = null
      }

      const onResize = () => {
        const width = window.innerWidth
        const height = window.innerHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
        composer.setSize(width, height)
        blurPass.uniforms.uResolution.value.set(width, height)
      }

      let animationFrameId = 0
      const animate = () => {
        animationFrameId = window.requestAnimationFrame(animate)
        const nextControls = controlsRef.current
        const elapsed = clock.getElapsedTime() * nextControls.speed
        waterMat.uniforms.uTime.value = elapsed
        sphere.position.y = 1.6 + Math.sin(elapsed * 1.5) * (0.08 + nextControls.curves * 0.12)
        sphere.position.x = nextControls.positionX * 1.4
        sphere.position.z = nextControls.positionY * 1.4
        sphere.scale.setScalar(0.8 + nextControls.scale * 0.35)
        sphere.rotation.y = elapsed * (0.05 + nextControls.turbulence * 0.12)
        sphere.rotation.z = Math.sin(elapsed * 0.5) * (0.02 + nextControls.curves * 0.08)
        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })
        composer.render()
      }

      onResize()
      animate()
      window.addEventListener('resize', onResize)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointerleave', onPointerLeave)
      window.addEventListener('touchmove', onTouchMove, { passive: false })

      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointerleave', onPointerLeave)
        window.removeEventListener('touchmove', onTouchMove)
        window.cancelAnimationFrame(animationFrameId)
        composer.dispose()
        waterGeo.dispose()
        waterMat.dispose()
        sphereGeo.dispose()
        sphereMat.dispose()
        pmremGenerator.dispose()
        renderTarget.dispose()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
    }

    if (isDisplacementBlobMode) {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#f4f3f0')

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
      camera.position.z = 4.5

      const noiseGLSL = `
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        float snoise(vec3 v){
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
          i = mod(i, 289.0);
          vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 1.0/7.0;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
      `

      const vertexShaderBlob = `
        ${noiseGLSL}
        uniform float uTime;
        uniform float uSpeed;
        uniform float uNoiseDensity;
        uniform float uNoiseStrength;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vNoise;

        vec3 getDisplacedPosition(vec3 p) {
          float n = snoise(p * uNoiseDensity + uTime * uSpeed);
          n += snoise(p * (uNoiseDensity * 2.0) - uTime * (uSpeed * 0.8)) * 0.3;
          return p + normalize(p) * n * uNoiseStrength;
        }

        void main() {
          vUv = uv;
          vec3 p = position;
          vec3 displacedP = getDisplacedPosition(p);
          vPosition = (modelMatrix * vec4(displacedP, 1.0)).xyz;
          vNoise = snoise(p * uNoiseDensity + uTime * uSpeed);

          float epsilon = 0.001;
          vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
          if (length(tangent) < 0.01) {
            tangent = normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
          }
          vec3 bitangent = normalize(cross(normal, tangent));
          vec3 pTangent = getDisplacedPosition(p + tangent * epsilon);
          vec3 pBitangent = getDisplacedPosition(p + bitangent * epsilon);
          vec3 newTangent = pTangent - displacedP;
          vec3 newBitangent = pBitangent - displacedP;
          vec3 newNormal = normalize(cross(newTangent, newBitangent));
          vNormal = normalMatrix * newNormal;

          gl_Position = projectionMatrix * viewMatrix * vec4(vPosition, 1.0);
        }
      `

      const fragmentShaderBlob = `
        ${noiseGLSL}
        uniform float uTime;
        uniform vec3 uColorTeal;
        uniform vec3 uColorPurple;
        uniform vec3 uColorPink;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vNoise;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float surfaceNoise = snoise(vPosition * 15.0 + uTime * 0.2) * 0.08;
          float microDetail = snoise(vPosition * 50.0) * 0.03;
          normal = normalize(normal + surfaceNoise + microDetail);

          float colorMixFactor = smoothstep(-1.0, 1.0, vNoise) + (vPosition.y * 0.2);
          vec3 baseColor = mix(uColorPurple, uColorTeal, smoothstep(0.0, 1.0, colorMixFactor));
          float pinkFactor = snoise(vPosition * 2.0 - uTime * 0.5);
          baseColor = mix(baseColor, uColorPink, smoothstep(0.2, 0.8, pinkFactor));

          vec3 lightDir1 = normalize(vec3(1.0, 1.5, 1.0));
          vec3 lightColor1 = vec3(1.0, 0.98, 0.95);
          vec3 lightDir2 = normalize(vec3(-1.0, -1.0, 0.5));
          vec3 lightColor2 = vec3(0.9, 0.88, 0.85);
          vec3 lightDir3 = normalize(vec3(0.0, 0.5, -1.0));
          vec3 lightColor3 = vec3(0.85, 0.85, 0.9);

          float diff1 = max(dot(normal, lightDir1), 0.0);
          float diff2 = max(dot(normal, lightDir2), 0.0) * 0.5;
          float diff3 = max(dot(normal, lightDir3), 0.0) * 0.3;
          vec3 diffuse = baseColor * (diff1 * lightColor1 + diff2 * lightColor2 + diff3 * lightColor3 + 0.15);

          vec3 half1 = normalize(lightDir1 + viewDir);
          float spec1 = pow(max(dot(normal, half1), 0.0), 128.0);
          vec3 half2 = normalize(lightDir2 + viewDir);
          float spec2 = pow(max(dot(normal, half2), 0.0), 64.0);
          vec3 specular = (spec1 * lightColor1 * 1.5) + (spec2 * lightColor2 * 0.8);

          float fresnelFactor = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          vec3 rimColor = mix(uColorPink, uColorTeal, snoise(vPosition * 3.0 + uTime));
          vec3 fresnel = fresnelFactor * rimColor * 2.5;

          float sss = pow(max(dot(viewDir, -lightDir1), 0.0), 2.0) * 0.3;
          vec3 sssColor = uColorPurple * sss;

          vec3 finalColor = diffuse + specular + fresnel + sssColor;
          finalColor = finalColor / (finalColor + vec3(1.0));
          finalColor = pow(finalColor, vec3(1.0 / 2.2));
          finalColor = smoothstep(0.0, 1.1, finalColor);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `

      const geometry = new THREE.IcosahedronGeometry(1.2, 64)
      const uniforms = {
        uTime: { value: 0 },
        uSpeed: { value: 0.2 },
        uNoiseDensity: { value: 1.5 },
        uNoiseStrength: { value: 0.4 },
        uColorTeal: { value: new THREE.Color('#ffffff') },
        uColorPurple: { value: new THREE.Color('#e0dcd3') },
        uColorPink: { value: new THREE.Color('#c9bcae') },
      }
      const material = new THREE.ShaderMaterial({
        vertexShader: vertexShaderBlob,
        fragmentShader: fragmentShaderBlob,
        uniforms,
      })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)

      const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }
      const onPointerMove = (event) => {
        const nextControls = controlsRef.current
        const halfX = window.innerWidth * 0.5
        const halfY = window.innerHeight * 0.5
        pointer.targetX = ((event.clientX - halfX) / halfX) * nextControls.cursorMovement + nextControls.cursorOffsetX
        pointer.targetY = ((event.clientY - halfY) / halfY) * nextControls.cursorMovement - nextControls.cursorOffsetY
      }
      const onTouchMove = (event) => {
        if (event.touches.length > 0) {
          const nextControls = controlsRef.current
          const halfX = window.innerWidth * 0.5
          const halfY = window.innerHeight * 0.5
          pointer.targetX = ((event.touches[0].clientX - halfX) / halfX) * nextControls.cursorMovement + nextControls.cursorOffsetX
          pointer.targetY = ((event.touches[0].clientY - halfY) / halfY) * nextControls.cursorMovement - nextControls.cursorOffsetY
        }
      }
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
      }

      let animationFrameId = 0
      const clock = new THREE.Clock()
      const animate = () => {
        animationFrameId = window.requestAnimationFrame(animate)
        const nextControls = controlsRef.current
        uniforms.uTime.value = clock.getElapsedTime() * nextControls.speed
        uniforms.uSpeed.value = 0.08 + nextControls.speed * 0.25
        uniforms.uNoiseDensity.value = 0.6 + nextControls.curves * 2.4
        uniforms.uNoiseStrength.value = 0.08 + nextControls.turbulence * 0.6
        uniforms.uColorTeal.value.set(nextControls.colorA)
        uniforms.uColorPurple.value.set(nextControls.colorB)
        uniforms.uColorPink.value.set(nextControls.colorC)
        pointer.x += (pointer.targetX - pointer.x) * (0.03 + nextControls.cursorReaction * 0.02)
        pointer.y += (pointer.targetY - pointer.y) * (0.03 + nextControls.cursorReaction * 0.02)
        mesh.rotation.y += (pointer.x * (Math.PI / 3) * nextControls.cursorReaction - mesh.rotation.y) * 0.05
        mesh.rotation.x += (pointer.y * (Math.PI / 4) * nextControls.cursorReaction - mesh.rotation.x) * 0.05
        mesh.rotation.z = Math.sin(uniforms.uTime.value * (0.05 + nextControls.speed * 0.12)) * (0.05 + nextControls.rotation * 0.0025)
        camera.position.z = 4.5 / Math.max(0.35, nextControls.scale)
        mesh.position.x = nextControls.positionX * 1.5
        mesh.position.y = nextControls.positionY * 1.5
        mesh.scale.setScalar(nextControls.effectSize)
        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })
        renderer.render(scene, camera)
      }

      onResize()
      animate()
      window.addEventListener('resize', onResize)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('touchmove', onTouchMove, { passive: true })

      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('touchmove', onTouchMove)
        window.cancelAnimationFrame(animationFrameId)
        geometry.dispose()
        material.dispose()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
    }

    if (isDitherFxMode) {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(controlsRef.current.ditherBgColor ?? '#3b82f6')

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
      camera.position.set(0, 0, 8)

      const vertexShaderDither = `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `

      const fragmentShaderDither = `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uBgColor;
        uniform float uPixelSize;
        uniform vec3 uLightDir;
        uniform float uSpread;
        varying vec3 vNormal;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 lightDir = normalize(uLightDir);
          float diff = max(dot(normal, lightDir), 0.0);
          float intensity = diff * 0.8 + 0.2;

          vec2 coord = gl_FragCoord.xy / uPixelSize;
          vec2 gridCoord = floor(coord);
          vec2 localUV = fract(coord);
          vec2 centered = localUV - 0.5;
          float d1 = abs(centered.x - centered.y);
          float d2 = abs(centered.x + centered.y);
          float thickness = 0.2;
          bool isShape = (d1 < thickness) || (d2 < thickness);

          int x = int(mod(gridCoord.x, 4.0));
          int y = int(mod(gridCoord.y, 4.0));
          float bayerValue = 0.0;

          if(x==0&&y==0) bayerValue=0.0625; else if(x==2&&y==0) bayerValue=0.5625; else if(x==1&&y==2) bayerValue=0.1875; else if(x==3&&y==2) bayerValue=0.6875;
          else if(x==2&&y==2) bayerValue=0.8125; else if(x==0&&y==2) bayerValue=0.3125; else if(x==3&&y==0) bayerValue=0.9375; else if(x==1&&y==0) bayerValue=0.4375;
          else if(x==1&&y==1) bayerValue=0.25; else if(x==3&&y==1) bayerValue=0.75; else if(x==0&&y==3) bayerValue=0.125; else if(x==2&&y==3) bayerValue=0.625;
          else if(x==3&&y==3) bayerValue=1.0; else if(x==1&&y==3) bayerValue=0.5; else if(x==2&&y==1) bayerValue=0.875; else if(x==0&&y==1) bayerValue=0.375;

          vec3 finalColor = uBgColor;
          if (isShape) {
            float v = intensity + (bayerValue - 0.5) * uSpread;
            if (v > 0.6) {
              finalColor = uColor1;
            } else if (v > 0.3) {
              finalColor = uColor2;
            } else {
              finalColor = uBgColor;
            }
          }
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `

      const createGeometry = (preset) => {
        if (preset === 'sphere') return new THREE.SphereGeometry(2, 64, 64)
        if (preset === 'knot') return new THREE.TorusKnotGeometry(1.2, 0.4, 180, 24)
        if (preset === 'shard') return new THREE.OctahedronGeometry(2.1, 3)
        return new THREE.TorusGeometry(1.5, 0.6, 40, 96)
      }

      const uniforms = {
        uColor1: { value: new THREE.Color('#ffffff') },
        uColor2: { value: new THREE.Color('#60a5fa') },
        uBgColor: { value: new THREE.Color(controlsRef.current.ditherBgColor ?? '#3b82f6') },
        uPixelSize: { value: 10.0 },
        uSpread: { value: 0.8 },
        uLightDir: { value: new THREE.Vector3(1.0, 1.0, 1.0).normalize() },
      }

      const material = new THREE.ShaderMaterial({
        vertexShader: vertexShaderDither,
        fragmentShader: fragmentShaderDither,
        uniforms,
      })

      let geometry = createGeometry(controlsRef.current.geometryPreset)
      let mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      let customModelRoot = null
      let usingCustomModel = false

      const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }
      let currentGeometryPreset = controlsRef.current.geometryPreset
      let loadToken = 0
      let disposed = false

      const disposeCustomModel = () => {
        if (!customModelRoot) return
        customModelRoot.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.dispose()
          }
        })
        scene.remove(customModelRoot)
        customModelRoot = null
      }

      const rebuildGeometry = (preset) => {
        if (usingCustomModel) return
        const nextGeometry = createGeometry(preset)
        scene.remove(mesh)
        geometry.dispose()
        geometry = nextGeometry
        mesh = new THREE.Mesh(geometry, material)
        scene.add(mesh)
        currentGeometryPreset = preset
      }

      const applyDitherMaterial = (object3d) => {
        object3d.traverse((child) => {
          if (child.isMesh) {
            child.material = material
          }
        })
      }

      const normalizeModel = (source) => {
        const box = new THREE.Box3().setFromObject(source)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z, 0.0001)
        source.position.sub(center)
        const wrapper = new THREE.Group()
        const normalized = new THREE.Group()
        normalized.scale.setScalar(3.2 / maxDim)
        normalized.add(source)
        wrapper.add(normalized)
        return wrapper
      }

      const parseGltfFile = async (file) => {
        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        const draco = new DRACOLoader()
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
        loader.setDRACOLoader(draco)

        const ktx2 = new KTX2Loader()
        ktx2.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
        ktx2.detectSupport(renderer)
        loader.setKTX2Loader(ktx2)

        const ext = file.name.split('.').pop()?.toLowerCase()
        const data = ext === 'gltf' ? await file.text() : await file.arrayBuffer()
        return new Promise((resolve, reject) => {
          loader.parse(
            data,
            '',
            (gltf) => {
              draco.dispose()
              ktx2.dispose()
              resolve(gltf)
            },
            (error) => {
              draco.dispose()
              ktx2.dispose()
              reject(error)
            },
          )
        })
      }

      const loadCustomModel = async (file) => {
        const localToken = ++loadToken
        try {
          if (onDitherModelStatusChange) {
            onDitherModelStatusChange(`Loading ${file.name}...`)
          }
          const gltf = await parseGltfFile(file)
          if (disposed || localToken !== loadToken) return

          const normalized = normalizeModel(gltf.scene)
          applyDitherMaterial(normalized)

          scene.remove(mesh)
          disposeCustomModel()
          customModelRoot = normalized
          scene.add(customModelRoot)
          usingCustomModel = true
          if (onDitherModelStatusChange) {
            onDitherModelStatusChange(`Loaded ${file.name}`)
          }
        } catch (error) {
          console.error('Failed to load GLTF/GLB model:', error)
          if (onDitherModelStatusChange) {
            const message = error?.message ? `${error.message}` : 'Unsupported or compressed model could not be decoded.'
            onDitherModelStatusChange(`Upload failed: ${message}`)
          }
        }
      }

      if (ditherModelFile) {
        loadCustomModel(ditherModelFile)
      } else {
        disposeCustomModel()
        usingCustomModel = false
        if (onDitherModelStatusChange) {
          onDitherModelStatusChange('')
        }
      }

      const onPointerMove = (event) => {
        const nextControls = controlsRef.current
        const halfX = window.innerWidth * 0.5
        const halfY = window.innerHeight * 0.5
        pointer.targetX = ((event.clientX - halfX) / halfX) * nextControls.cursorMovement + nextControls.cursorOffsetX
        pointer.targetY = ((event.clientY - halfY) / halfY) * nextControls.cursorMovement - nextControls.cursorOffsetY
      }

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
      }

      const clock = new THREE.Clock()
      let animationFrameId = 0
      const animate = () => {
        animationFrameId = window.requestAnimationFrame(animate)
        const nextControls = controlsRef.current

        if (nextControls.geometryPreset !== currentGeometryPreset) {
          rebuildGeometry(nextControls.geometryPreset)
        }

        uniforms.uColor1.value.set(nextControls.colorA)
        uniforms.uColor2.value.set(nextControls.colorB)
        uniforms.uBgColor.value.set(nextControls.ditherBgColor ?? nextControls.colorC)
        scene.background = uniforms.uBgColor.value
        uniforms.uPixelSize.value = 4 + (1 - nextControls.softness / 1.5) * 20
        uniforms.uSpread.value = 0.1 + nextControls.turbulence * 1.3
        uniforms.uLightDir.value.set(
          -2 + nextControls.curves * 4,
          0.4 + nextControls.cursorReaction * 1.1,
          1.2 + nextControls.brightness * 0.8,
        ).normalize()

        pointer.x += (pointer.targetX - pointer.x) * (0.025 + nextControls.cursorReaction * 0.02)
        pointer.y += (pointer.targetY - pointer.y) * (0.025 + nextControls.cursorReaction * 0.02)

        const elapsed = clock.getElapsedTime() * nextControls.speed
        const activeObject = customModelRoot ?? mesh
        activeObject.rotation.y += ((pointer.x * 1.4 + elapsed * (0.18 + nextControls.curves * 0.25)) - activeObject.rotation.y) * 0.06
        activeObject.rotation.x += ((pointer.y * 1.0 + Math.sin(elapsed * 0.7) * 0.18) - activeObject.rotation.x) * 0.06
        activeObject.rotation.z = (nextControls.rotation * Math.PI) / 180 + Math.sin(elapsed * 0.4) * 0.15
        camera.position.z = 8 / Math.max(0.35, nextControls.scale)
        activeObject.position.x = nextControls.positionX * 2.2
        activeObject.position.y = nextControls.positionY * 2.2
        activeObject.scale.setScalar(0.65 + nextControls.effectSize * 0.95)

        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })
        renderer.render(scene, camera)
      }

      onResize()
      animate()
      window.addEventListener('resize', onResize)
      window.addEventListener('pointermove', onPointerMove)

      return () => {
        disposed = true
        loadToken += 1
        window.removeEventListener('resize', onResize)
        window.removeEventListener('pointermove', onPointerMove)
        window.cancelAnimationFrame(animationFrameId)
        geometry.dispose()
        disposeCustomModel()
        material.dispose()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
    }

    if (isNebulaMode) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0x030308, 0.001)

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
      camera.position.z = 100

      const nebulaVertexShader = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `

      const nebulaFragmentShader = `
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_mouse_velocity;
        varying vec2 vUv;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        float noise(in vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);
          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        #define OCTAVES 6
        float fbm(in vec2 st) {
          float value = 0.0;
          float amplitude = 0.5;
          vec2 shift = vec2(100.0);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < OCTAVES; i++) {
            value += amplitude * noise(st);
            st = rot * st * 2.0 + shift;
            amplitude *= 0.5;
          }
          return value;
        }

        void main() {
          vec2 st = gl_FragCoord.xy / u_resolution.xy;
          st.x *= u_resolution.x / u_resolution.y;

          vec2 mouse = u_mouse / u_resolution.xy;
          mouse.x *= u_resolution.x / u_resolution.y;

          vec2 toMouse = st - mouse;
          float distToMouse = length(toMouse);
          float mouseInfluence = exp(-distToMouse * 4.0);
          vec2 displacement = normalize(toMouse + 0.001) * mouseInfluence * (0.1 + u_mouse_velocity * 0.05);
          vec2 distortedSt = st - displacement;

          vec2 q = vec2(0.0);
          q.x = fbm(distortedSt + 0.02 * u_time);
          q.y = fbm(distortedSt + vec2(1.0));

          vec2 r = vec2(0.0);
          r.x = fbm(distortedSt + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
          r.y = fbm(distortedSt + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time);
          r += (mouseInfluence * 0.5) * vec2(sin(u_time), cos(u_time));

          float f = fbm(distortedSt + r);

          vec3 color = mix(vec3(0.02, 0.02, 0.05), vec3(0.1, 0.05, 0.2), clamp((f * f) * 4.0, 0.0, 1.0));
          color = mix(color, vec3(0.2, 0.3, 0.6), clamp(length(q), 0.0, 1.0));
          color = mix(color, vec3(0.6, 0.1, 0.4), clamp(length(r.x), 0.0, 1.0));

          float lightIntensity = pow(f, 3.5) * 2.5;
          vec3 lightColor = vec3(0.4, 0.8, 1.0);
          float cursorGlow = exp(-distToMouse * 8.0) * (0.2 + u_mouse_velocity * 0.5);

          color += lightColor * lightIntensity;
          color += vec3(0.3, 0.1, 0.5) * cursorGlow;

          vec3 finalColor = (f * f * f + 0.6 * f * f + 0.5 * f) * color;
          finalColor = mix(vec3(0.01, 0.01, 0.02), finalColor, smoothstep(0.1, 0.4, f));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `

      const uniforms = {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2() },
        u_mouse: { value: new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5) },
        u_mouse_velocity: { value: 0.0 },
      }

      const backgroundScene = new THREE.Scene()
      const backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const fullscreenQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          vertexShader: nebulaVertexShader,
          fragmentShader: nebulaFragmentShader,
          uniforms,
          depthWrite: false,
          depthTest: false,
        }),
      )
      backgroundScene.add(fullscreenQuad)

      const starGeometry = new THREE.BufferGeometry()
      const starCount = 4000
      const starPositions = new Float32Array(starCount * 3)
      const starSizes = new Float32Array(starCount)
      const starColors = new Float32Array(starCount * 3)

      const color1 = new THREE.Color(0xffffff)
      const color2 = new THREE.Color(0xaaccff)
      const color3 = new THREE.Color(0xffccaa)

      for (let i = 0; i < starCount; i += 1) {
        starPositions[i * 3] = (Math.random() - 0.5) * 800
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 800
        starPositions[i * 3 + 2] = (Math.random() - 0.5) * 800 - 200
        starSizes[i] = Math.random() * 1.5

        const randColor = Math.random()
        let c = color1
        if (randColor > 0.9) c = color3
        else if (randColor > 0.8) c = color2

        starColors[i * 3] = c.r
        starColors[i * 3 + 1] = c.g
        starColors[i * 3 + 2] = c.b
      }

      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1))
      starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))

      const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0.0 },
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          uniform float u_time;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float twinkle = sin(position.x * 10.0 + u_time * 2.0) * 0.5 + 0.5;
            gl_PointSize = size * (300.0 / -mvPosition.z) * (0.5 + twinkle * 0.5);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = (0.5 - dist) * 2.0;
            gl_FragColor = vec4(vColor, alpha * 0.6);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })

      const starField = new THREE.Points(starGeometry, starMaterial)
      scene.add(starField)

      let targetMouseX = window.innerWidth * 0.5
      let targetMouseY = window.innerHeight * 0.5
      let mouseX = targetMouseX
      let mouseY = targetMouseY
      let prevMouseX = targetMouseX
      let prevMouseY = targetMouseY
      let mouseVelocity = 0

      const onPointerMove = (event) => {
        const nextControls = controlsRef.current
        const mapped = mapClientToEffectSpace(
          event.clientX,
          event.clientY,
          nextControls,
          { width: window.innerWidth, height: window.innerHeight },
        )
        const centeredX = window.innerWidth * 0.5 + (mapped.x - window.innerWidth * 0.5) * nextControls.cursorMovement
        const centeredY = window.innerHeight * 0.5 + (mapped.y - window.innerHeight * 0.5) * nextControls.cursorMovement
        targetMouseX = centeredX + nextControls.cursorOffsetX * window.innerWidth
        targetMouseY = centeredY - nextControls.cursorOffsetY * window.innerHeight
      }

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.getDrawingBufferSize(uniforms.u_resolution.value)
      }

      const clock = new THREE.Clock()
      let animationFrameId = 0
      const animate = () => {
        animationFrameId = window.requestAnimationFrame(animate)
        const nextControls = controlsRef.current
        const elapsedTime = clock.getElapsedTime() * nextControls.speed

        mouseX += (targetMouseX - mouseX) * (0.04 + nextControls.cursorReaction * 0.05)
        mouseY += (targetMouseY - mouseY) * (0.04 + nextControls.cursorReaction * 0.05)

        const dx = targetMouseX - prevMouseX
        const dy = targetMouseY - prevMouseY
        const currentVel = Math.sqrt(dx * dx + dy * dy)
        mouseVelocity += (currentVel - mouseVelocity) * 0.1
        prevMouseX = targetMouseX
        prevMouseY = targetMouseY

        uniforms.u_time.value = elapsedTime * (0.35 + nextControls.curves * 0.45)
        const dpr = renderer.getPixelRatio()
        uniforms.u_mouse.value.set(mouseX * dpr, (window.innerHeight - mouseY) * dpr)
        uniforms.u_mouse_velocity.value = Math.min((mouseVelocity / 50.0) * nextControls.cursorReaction, 2.0)
        starMaterial.uniforms.u_time.value = elapsedTime

        const parallaxX = (mouseX / window.innerWidth - 0.5) * 20 * nextControls.cursorReaction
        const parallaxY = ((window.innerHeight - mouseY) / window.innerHeight - 0.5) * 20 * nextControls.cursorReaction
        camera.position.x += (parallaxX - camera.position.x) * 0.05
        camera.position.y += (parallaxY - camera.position.y) * 0.05
        camera.position.z = (80 + (1.8 - nextControls.effectSize) * 24) / Math.max(0.35, nextControls.scale)
        camera.lookAt(scene.position)

        starField.rotation.y = elapsedTime * (0.01 + nextControls.turbulence * 0.03)
        starField.rotation.x = elapsedTime * (0.005 + nextControls.curves * 0.02)
        starField.position.x = nextControls.positionX * 24
        starField.position.y = nextControls.positionY * 24
        starField.scale.setScalar(0.85 + nextControls.effectSize * 0.45)

        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })

        renderer.autoClear = false
        renderer.clear()
        renderer.render(backgroundScene, backgroundCamera)
        renderer.render(scene, camera)
      }

      onResize()
      animate()
      window.addEventListener('resize', onResize)
      window.addEventListener('pointermove', onPointerMove)

      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('pointermove', onPointerMove)
        window.cancelAnimationFrame(animationFrameId)
        fullscreenQuad.geometry.dispose()
        fullscreenQuad.material.dispose()
        starGeometry.dispose()
        starMaterial.dispose()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
    }

    if (isReactantFieldMode) {
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      container.appendChild(canvas)

      const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false })
      if (!gl) {
        return () => {
          if (container.contains(canvas)) container.removeChild(canvas)
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      let width = 0
      let height = 0

      const vertexShaderSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_position * 0.5 + 0.5;
        }
      `

      const simFragmentShaderSource = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_prevFrame;
        uniform vec2 u_mouse;
        uniform vec2 u_mouseVel;
        uniform float u_time;
        uniform vec2 u_resolution;
        out vec4 outColor;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m;
          m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
          vec2 uv = v_texCoord;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 p = uv - u_mouse;
          p.x *= aspect;

          float velMag = length(u_mouseVel) * 100.0;
          float radius = 0.015 + velMag * 0.01;
          float inputIntensity = exp(-dot(p, p) / (radius * radius));

          vec2 offset = vec2(0.0, 0.003);
          float n = snoise(uv * 5.0 - vec2(0.0, u_time * 0.5));
          offset.x += n * 0.001;

          float prevIntensity = texture(u_prevFrame, uv - offset).r;
          float decay = 0.94;
          float newIntensity = clamp(inputIntensity + prevIntensity * decay, 0.0, 1.0);

          outColor = vec4(newIntensity, 0.0, 0.0, 1.0);
        }
      `

      const renderFragmentShaderSource = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_simFrame;
        uniform vec2 u_resolution;
        out vec4 outColor;

        vec3 getColor(float intensity) {
          vec3 c0 = vec3(0.01, 0.01, 0.02);
          vec3 c1 = vec3(0.35, 0.0, 0.0);
          vec3 c2 = vec3(0.9, 0.1, 0.0);
          vec3 c3 = vec3(1.0, 0.85, 0.0);
          vec3 c4 = vec3(1.0, 1.0, 1.0);
          vec3 color = mix(c0, c1, smoothstep(0.0, 0.2, intensity));
          color = mix(color, c2, smoothstep(0.2, 0.5, intensity));
          color = mix(color, c3, smoothstep(0.5, 0.8, intensity));
          color = mix(color, c4, smoothstep(0.8, 1.0, intensity));
          return color;
        }

        float sdRoundBox(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }

        void main() {
          vec2 uv = v_texCoord;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 texel = 1.0 / u_resolution;

          float intensity = 0.0;
          intensity += texture(u_simFrame, uv).r * 0.5;
          intensity += texture(u_simFrame, uv + vec2(texel.x, 0.0)).r * 0.125;
          intensity += texture(u_simFrame, uv - vec2(texel.x, 0.0)).r * 0.125;
          intensity += texture(u_simFrame, uv + vec2(0.0, texel.y)).r * 0.125;
          intensity += texture(u_simFrame, uv - vec2(0.0, texel.y)).r * 0.125;

          vec3 lightColor = getColor(intensity);
          float cells = 18.0;
          vec2 gridUv = uv * vec2(aspect, 1.0) * cells;
          vec2 cellUv = fract(gridUv) - 0.5;
          float holeDist = sdRoundBox(cellUv, vec2(0.42), 0.12);

          vec3 gridSurfaceColor = vec3(0.04, 0.04, 0.04);
          float alphaMask = smoothstep(0.0, 0.03, holeDist);
          float edgeBleed = smoothstep(0.15, 0.0, holeDist) * intensity;
          vec3 solidGridColor = gridSurfaceColor + (lightColor * edgeBleed * 0.5);
          vec3 finalColor = mix(lightColor, solidGridColor, alphaMask);

          vec2 vigUv = uv * 2.0 - 1.0;
          float vig = dot(vigUv, vigUv);
          finalColor *= 1.0 - (vig * 0.3);

          outColor = vec4(finalColor, 1.0);
        }
      `

      const compileShader = (type, source) => {
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error('Shader compile error:', gl.getShaderInfoLog(shader))
          gl.deleteShader(shader)
          return null
        }
        return shader
      }

      const createProgram = (vsSource, fsSource) => {
        const vs = compileShader(gl.VERTEX_SHADER, vsSource)
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSource)
        if (!vs || !fs) return null
        const program = gl.createProgram()
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error('Program link error:', gl.getProgramInfoLog(program))
          return null
        }
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        return program
      }

      const simProgram = createProgram(vertexShaderSource, simFragmentShaderSource)
      const renderProgram = createProgram(vertexShaderSource, renderFragmentShaderSource)
      if (!simProgram || !renderProgram) {
        return () => {
          if (container.contains(canvas)) container.removeChild(canvas)
        }
      }

      const positionBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      )

      const simAPos = gl.getAttribLocation(simProgram, 'a_position')
      const simPrevFrame = gl.getUniformLocation(simProgram, 'u_prevFrame')
      const simMouse = gl.getUniformLocation(simProgram, 'u_mouse')
      const simMouseVel = gl.getUniformLocation(simProgram, 'u_mouseVel')
      const simTime = gl.getUniformLocation(simProgram, 'u_time')
      const simRes = gl.getUniformLocation(simProgram, 'u_resolution')

      const renderAPos = gl.getAttribLocation(renderProgram, 'a_position')
      const renderSimFrame = gl.getUniformLocation(renderProgram, 'u_simFrame')
      const renderRes = gl.getUniformLocation(renderProgram, 'u_resolution')

      gl.getExtension('EXT_color_buffer_float')

      const createFBO = () => {
        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, canvas.width, canvas.height, 0, gl.RED, gl.HALF_FLOAT, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const fb = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        return { fb, texture }
      }

      let fboA = null
      let fboB = null
      const rebuildFbos = () => {
        if (fboA) {
          gl.deleteFramebuffer(fboA.fb)
          gl.deleteTexture(fboA.texture)
        }
        if (fboB) {
          gl.deleteFramebuffer(fboB.fb)
          gl.deleteTexture(fboB.texture)
        }
        fboA = createFBO()
        fboB = createFBO()
      }

      const mouse = { x: 0.5, y: 0.5, vx: 0, vy: 0 }
      const lastMouse = { x: 0.5, y: 0.5 }

      const resize = () => {
        const rect = container.getBoundingClientRect()
        width = rect.width
        height = rect.height
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
        gl.viewport(0, 0, canvas.width, canvas.height)
        rebuildFbos()
      }

      const updatePointer = (clientX, clientY) => {
        const nextControls = controlsRef.current
        const mapped = mapClientToEffectSpace(
          clientX,
          clientY,
          nextControls,
          { width: window.innerWidth, height: window.innerHeight },
        )
        const rawX = THREE.MathUtils.clamp(mapped.x / window.innerWidth, 0, 1)
        const rawY = THREE.MathUtils.clamp(1.0 - (mapped.y / window.innerHeight), 0, 1)
        const x = THREE.MathUtils.clamp(0.5 + (rawX - 0.5) * nextControls.cursorMovement + nextControls.cursorOffsetX, 0, 1)
        const y = THREE.MathUtils.clamp(0.5 + (rawY - 0.5) * nextControls.cursorMovement + nextControls.cursorOffsetY, 0, 1)
        mouse.vx = x - lastMouse.x
        mouse.vy = y - lastMouse.y
        mouse.x = x
        mouse.y = y
        lastMouse.x = x
        lastMouse.y = y
      }

      const onPointerMove = (event) => updatePointer(event.clientX, event.clientY)
      const onTouchMove = (event) => {
        if (event.touches.length > 0) {
          event.preventDefault()
          updatePointer(event.touches[0].clientX, event.touches[0].clientY)
        }
      }

      resize()

      let animationFrameId = 0
      const render = (now) => {
        animationFrameId = window.requestAnimationFrame(render)
        const nextControls = controlsRef.current
        const time = now * 0.001 * nextControls.speed

        if (Math.abs(mouse.vx) < 0.001 && Math.abs(mouse.vy) < 0.001) {
          const tx = 0.5 + Math.sin(time * 0.5) * 0.2
          const ty = 0.5 + Math.cos(time * 0.3) * 0.2
          mouse.x += (tx - mouse.x) * 0.02
          mouse.y += (ty - mouse.y) * 0.02
        }

        mouse.vx *= 0.9
        mouse.vy *= 0.9

        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb)
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.useProgram(simProgram)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.enableVertexAttribArray(simAPos)
        gl.vertexAttribPointer(simAPos, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, fboA.texture)
        gl.uniform1i(simPrevFrame, 0)
        gl.uniform2f(simMouse, mouse.x, mouse.y)
        gl.uniform2f(simMouseVel, mouse.vx * nextControls.cursorReaction, mouse.vy * nextControls.cursorReaction)
        gl.uniform1f(simTime, time)
        gl.uniform2f(simRes, canvas.width, canvas.height)
        gl.drawArrays(gl.TRIANGLES, 0, 6)

        const temp = fboA
        fboA = fboB
        fboB = temp

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.useProgram(renderProgram)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.enableVertexAttribArray(renderAPos)
        gl.vertexAttribPointer(renderAPos, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, fboA.texture)
        gl.uniform1i(renderSimFrame, 0)
        gl.uniform2f(renderRes, canvas.width, canvas.height)
        applyEffectPresentation(canvas, nextControls, { width, height })
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      window.addEventListener('resize', resize)
      window.addEventListener('mousemove', onPointerMove)
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      animationFrameId = window.requestAnimationFrame(render)

      return () => {
        window.removeEventListener('resize', resize)
        window.removeEventListener('mousemove', onPointerMove)
        window.removeEventListener('touchmove', onTouchMove)
        window.cancelAnimationFrame(animationFrameId)
        if (fboA) {
          gl.deleteFramebuffer(fboA.fb)
          gl.deleteTexture(fboA.texture)
        }
        if (fboB) {
          gl.deleteFramebuffer(fboB.fb)
          gl.deleteTexture(fboB.texture)
        }
        gl.deleteBuffer(positionBuffer)
        gl.deleteProgram(simProgram)
        gl.deleteProgram(renderProgram)
        if (container.contains(canvas)) container.removeChild(canvas)
      }
    }

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    const drawingBufferSize = new THREE.Vector2()
    renderer.getDrawingBufferSize(drawingBufferSize)

    const uniforms = {
      u_time: { value: 0.0 },
      u_resolution: { value: drawingBufferSize.clone() },
      u_mouse: { value: mouseTargetRef.current.clone() },
      u_pixelRatio: { value: renderer.getPixelRatio() },
      u_zoom: { value: Math.max(0.35, controlsRef.current.scale) },
      u_curveAmount: { value: controlsRef.current.curves },
      u_turbulenceAmount: { value: controlsRef.current.turbulence },
      u_grainAmount: { value: controlsRef.current.grain },
      u_paletteMix: { value: 0.0 },
      u_colorA: { value: new THREE.Color(controlsRef.current.colorA) },
      u_colorB: { value: new THREE.Color(controlsRef.current.colorB) },
      u_colorC: { value: new THREE.Color(controlsRef.current.colorC) },
    }
    const baseColorA = (shaderConfig.defaultControls?.colorA ?? DEFAULT_SHADER_CONTROLS.colorA).toLowerCase()
    const baseColorB = (shaderConfig.defaultControls?.colorB ?? DEFAULT_SHADER_CONTROLS.colorB).toLowerCase()
    const baseColorC = (shaderConfig.defaultControls?.colorC ?? DEFAULT_SHADER_CONTROLS.colorC).toLowerCase()

    if (isDisturbance) {
      uniforms.u_trail = { value: trailRef.current.clone() }
      uniforms.u_mouse_dir = { value: mouseDirRef.current.clone() }
      uniforms.u_mouse_speed = { value: 0.0 }
    }

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: withGlobalZoom(shaderConfig.fragmentShader),
      uniforms,
      depthWrite: false,
      depthTest: false,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const clock = new THREE.Clock()
    let animationFrameId = 0

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Restore the first shader's autonomous movement phase until cursor interaction.
      if (shaderConfig.id === 'prismatic-disturbance' && !hasInteracted) {
        mouseTargetRef.current.set(
          0.5 + Math.sin(elapsed * (0.35 + controlsRef.current.curves * 0.2)) * (0.08 + controlsRef.current.cursorMovement * 0.1),
          0.5 + Math.cos(elapsed * (0.27 + controlsRef.current.curves * 0.14)) * (0.06 + controlsRef.current.cursorMovement * 0.06),
        )
      }

      if (isDisturbance) {
        const nextControls = controlsRef.current
        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })
        uniforms.u_mouse.value.lerp(mouseTargetRef.current, 0.08 + nextControls.cursorReaction * 0.2)
        trailRef.current.lerp(uniforms.u_mouse.value, 0.035)
        uniforms.u_trail.value.copy(trailRef.current)
        uniforms.u_mouse_dir.value.lerp(mouseDirRef.current, 0.2)
        speedRef.current *= 0.95
        uniforms.u_mouse_speed.value = THREE.MathUtils.lerp(uniforms.u_mouse_speed.value, speedRef.current * nextControls.cursorReaction, 0.14)
      } else {
        const nextControls = controlsRef.current
        applyEffectPresentation(renderer.domElement, nextControls, { width: window.innerWidth, height: window.innerHeight })
        uniforms.u_mouse.value.lerp(mouseTargetRef.current, mouseLerp * Math.max(0.25, nextControls.cursorReaction))
      }

      uniforms.u_time.value = elapsed * controlsRef.current.speed
      uniforms.u_zoom.value = Math.max(0.35, controlsRef.current.scale)
      uniforms.u_curveAmount.value = controlsRef.current.curves
      uniforms.u_turbulenceAmount.value = controlsRef.current.turbulence
      uniforms.u_grainAmount.value = controlsRef.current.grain
      uniforms.u_colorA.value.set(controlsRef.current.colorA)
      uniforms.u_colorB.value.set(controlsRef.current.colorB)
      uniforms.u_colorC.value.set(controlsRef.current.colorC)
      const dA = colorDistance01(controlsRef.current.colorA, baseColorA)
      const dB = colorDistance01(controlsRef.current.colorB, baseColorB)
      const dC = colorDistance01(controlsRef.current.colorC, baseColorC)
      const paletteDelta = Math.max(dA, dB, dC)
      const paletteTarget = Math.min(0.82, paletteDelta * 2.4)
      uniforms.u_paletteMix.value = THREE.MathUtils.lerp(uniforms.u_paletteMix.value, paletteTarget, 0.14)
      renderer.render(scene, camera)
    }

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.getDrawingBufferSize(drawingBufferSize)
      uniforms.u_resolution.value.copy(drawingBufferSize)
      uniforms.u_pixelRatio.value = renderer.getPixelRatio()
    }

    const onPointerMove = (event) => {
      const nextControls = controlsRef.current
      const mapped = mapClientToEffectSpace(
        event.clientX,
        event.clientY,
        nextControls,
        { width: window.innerWidth, height: window.innerHeight },
      )
      const rawX = THREE.MathUtils.clamp(mapped.x / window.innerWidth, 0, 1)
      const rawY = THREE.MathUtils.clamp(1.0 - (mapped.y / window.innerHeight), 0, 1)
      const x = THREE.MathUtils.clamp(0.5 + (rawX - 0.5) * nextControls.cursorMovement + nextControls.cursorOffsetX, 0, 1)
      const y = THREE.MathUtils.clamp(0.5 + (rawY - 0.5) * nextControls.cursorMovement + nextControls.cursorOffsetY, 0, 1)
      hasInteracted = true

      if (isDisturbance) {
        const dx = x - prevMouseRef.current.x
        const dy = y - prevMouseRef.current.y
        const dist = Math.hypot(dx, dy)

        if (dist > 0.0001) {
          mouseDirRef.current.set(dx / dist, dy / dist)
        }

        speedRef.current = Math.min(2.4, speedRef.current + dist * 12.0 * nextControls.cursorReaction)
      }

      prevMouseRef.current.set(x, y)
      mouseTargetRef.current.set(x, y)
    }

    const onPointerLeave = () => {
      mouseTargetRef.current.set(0.5, 0.5)
      if (isDisturbance) {
        speedRef.current *= 0.8
      }
      if (shaderConfig.id === 'prismatic-disturbance') {
        hasInteracted = false
      }
    }

    animate()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerleave', onPointerLeave)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
      window.cancelAnimationFrame(animationFrameId)
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      renderer.dispose()

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [ditherModelFile, isDisplacementBlobMode, isDisturbance, isDitherFxMode, isMeditativeMode, isShaderMode, mouseLerp, onDitherModelStatusChange, shaderConfig.fragmentShader])

  return <div id="canvas-container" ref={containerRef} aria-hidden="true" />
}

export default AuroraBackground
