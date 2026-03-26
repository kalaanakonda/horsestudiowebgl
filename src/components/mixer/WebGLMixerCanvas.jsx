import { useEffect, useMemo, useRef } from 'react'

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_speed;
uniform float u_scale;
uniform float u_intensity;
uniform float u_reactivity;
uniform float u_hueShift;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_noise;
uniform float u_warp;
uniform float u_ripple;
uniform float u_stripes;
uniform float u_dither;
uniform float u_grain;
uniform float u_bloom;
uniform float u_voronoi;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + 19.1;
    a *= 0.5;
  }
  return v;
}

float voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      md = min(md, d);
    }
  }
  return sqrt(md);
}

vec3 hueRotate(vec3 color, float degrees) {
  float a = radians(degrees);
  float s = sin(a);
  float c = cos(a);
  mat3 m = mat3(
    0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.330 * s, 0.114 - 0.114 * c - 0.497 * s,
    0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
    0.299 - 0.300 * c + 1.250 * s, 0.587 - 0.588 * c - 1.050 * s, 0.114 + 0.886 * c - 0.203 * s
  );
  return clamp(m * color, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 st = uv * 2.0 - 1.0;
  st.x *= u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse;
  mouse.x *= u_resolution.x / u_resolution.y;
  vec2 toMouse = st - mouse;
  float distMouse = length(toMouse);
  float react = exp(-distMouse * (2.0 + u_reactivity * 3.0));

  vec2 p = st * (0.9 + u_scale * 2.0);
  float t = u_time * (0.2 + u_speed * 1.6);

  if (u_warp > 0.001) {
    float ang = atan(toMouse.y, toMouse.x);
    float swirl = (0.2 + u_warp * 1.6) * react;
    p += vec2(cos(ang + t), sin(ang + t)) * swirl;
  }

  float f = 0.0;
  if (u_noise > 0.001) {
    f += fbm(p + vec2(t * 0.9, -t * 0.55)) * u_noise;
  }

  if (u_voronoi > 0.001) {
    float v = 1.0 - voronoi(p * (2.0 + u_voronoi * 5.0) + t * 0.25);
    f += v * (0.3 + u_voronoi * 0.9);
  }

  if (u_ripple > 0.001) {
    float ring = sin(distMouse * (18.0 + u_ripple * 24.0) - t * (4.0 + u_ripple * 8.0));
    f += ring * react * (0.2 + u_ripple * 0.8);
  }

  if (u_stripes > 0.001) {
    float stripe = sin((st.x + st.y * 0.15 + t * 0.08) * (16.0 + u_stripes * 80.0));
    f += stripe * (0.08 + u_stripes * 0.34);
  }

  f *= (0.4 + u_intensity * 1.5);
  f += react * (0.1 + u_reactivity * 0.4);

  vec3 col = mix(u_colorA, u_colorB, smoothstep(-0.5, 0.45, f));
  col = mix(col, u_colorC, smoothstep(0.25, 1.2, f));
  col = hueRotate(col, u_hueShift);

  if (u_bloom > 0.001) {
    float b = pow(max(f, 0.0), 2.0) * (0.2 + u_bloom * 1.7);
    col += vec3(b) * mix(u_colorB, u_colorC, 0.4);
  }

  if (u_dither > 0.001) {
    float steps = mix(28.0, 5.0, clamp(u_dither, 0.0, 1.0));
    col = floor(col * steps + 0.5) / steps;
  }

  if (u_grain > 0.001) {
    float n = hash(gl_FragCoord.xy + t);
    col += (n - 0.5) * (0.01 + u_grain * 0.07);
  }

  float v = smoothstep(1.35, 0.3, length(st));
  col *= mix(0.55, 1.0, v);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) return null
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  return program
}

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '')
  const value = parseInt(cleaned, 16)
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  }
}

function WebGLMixerCanvas({ controls, moduleWeights }) {
  const canvasRef = useRef(null)
  const pointerTarget = useRef({ x: 0.5, y: 0.5 })
  const pointerCurrent = useRef({ x: 0.5, y: 0.5 })
  const controlsRef = useRef(controls)
  const weightsRef = useRef(moduleWeights)

  useEffect(() => {
    controlsRef.current = controls
  }, [controls])

  useEffect(() => {
    weightsRef.current = moduleWeights
  }, [moduleWeights])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false })
    if (!gl) return undefined

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    if (!program) return undefined

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const attrib = gl.getAttribLocation(program, 'a_position')
    const getUniform = (name) => gl.getUniformLocation(program, name)
    const uniforms = {
      resolution: getUniform('u_resolution'),
      mouse: getUniform('u_mouse'),
      time: getUniform('u_time'),
      speed: getUniform('u_speed'),
      scale: getUniform('u_scale'),
      intensity: getUniform('u_intensity'),
      reactivity: getUniform('u_reactivity'),
      hueShift: getUniform('u_hueShift'),
      colorA: getUniform('u_colorA'),
      colorB: getUniform('u_colorB'),
      colorC: getUniform('u_colorC'),
      noise: getUniform('u_noise'),
      warp: getUniform('u_warp'),
      ripple: getUniform('u_ripple'),
      stripes: getUniform('u_stripes'),
      dither: getUniform('u_dither'),
      grain: getUniform('u_grain'),
      bloom: getUniform('u_bloom'),
      voronoi: getUniform('u_voronoi'),
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const onPointerMove = (event) => {
      pointerTarget.current.x = event.clientX / window.innerWidth
      pointerTarget.current.y = 1 - event.clientY / window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove)

    const start = performance.now()
    let frameId = 0

    const render = (now) => {
      frameId = requestAnimationFrame(render)
      const elapsed = (now - start) * 0.001

      pointerCurrent.current.x += (pointerTarget.current.x - pointerCurrent.current.x) * 0.09
      pointerCurrent.current.y += (pointerTarget.current.y - pointerCurrent.current.y) * 0.09

      const currentControls = controlsRef.current
      const rgbA = hexToRgb(currentControls.colorA)
      const rgbB = hexToRgb(currentControls.colorB)
      const rgbC = hexToRgb(currentControls.colorC)
      const weights = weightsRef.current

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(attrib)
      gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform2f(uniforms.mouse, pointerCurrent.current.x, pointerCurrent.current.y)
      gl.uniform1f(uniforms.time, elapsed)
      gl.uniform1f(uniforms.speed, currentControls.speed)
      gl.uniform1f(uniforms.scale, currentControls.scale)
      gl.uniform1f(uniforms.intensity, currentControls.intensity)
      gl.uniform1f(uniforms.reactivity, currentControls.reactivity)
      gl.uniform1f(uniforms.hueShift, currentControls.hueShift)
      gl.uniform3f(uniforms.colorA, rgbA.r, rgbA.g, rgbA.b)
      gl.uniform3f(uniforms.colorB, rgbB.r, rgbB.g, rgbB.b)
      gl.uniform3f(uniforms.colorC, rgbC.r, rgbC.g, rgbC.b)

      gl.uniform1f(uniforms.noise, weights.noise)
      gl.uniform1f(uniforms.warp, weights.warp)
      gl.uniform1f(uniforms.ripple, weights.ripple)
      gl.uniform1f(uniforms.stripes, weights.stripes)
      gl.uniform1f(uniforms.dither, weights.dither)
      gl.uniform1f(uniforms.grain, weights.grain)
      gl.uniform1f(uniforms.bloom, weights.bloom)
      gl.uniform1f(uniforms.voronoi, weights.voronoi)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    frameId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      cancelAnimationFrame(frameId)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  return <canvas ref={canvasRef} className="mixer-canvas" />
}

export default WebGLMixerCanvas
