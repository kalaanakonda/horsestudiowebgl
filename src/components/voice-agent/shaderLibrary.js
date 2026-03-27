export const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const prismaticDisturbanceFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_trail;
uniform vec2 u_mouse_dir;
uniform float u_mouse_speed;
varying vec2 vUv;

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 st = vec2(uv.x * aspect, uv.y);

  vec3 bgDark = vec3(0.04, 0.04, 0.05);
  vec3 pureWhite = vec3(1.0, 1.0, 1.0);
  vec3 violet = vec3(0.71, 0.17, 1.0);
  vec3 cyan = vec3(0.0, 0.94, 1.0);
  vec3 yellow = vec3(0.92, 1.0, 0.0);
  vec3 red = vec3(1.0, 0.0, 0.24);

  float angle = -0.6;
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 diagUv = rot * (st - vec2(0.5, 0.5));
  float noiseVal = snoise(vec2(st.x * 2.0 - u_time * 0.1, st.y * 2.0 + u_time * 0.05)) * 0.15;
  float beamPos = diagUv.y + noiseVal;

  vec2 cursor = vec2(u_mouse.x * aspect, u_mouse.y);
  vec2 trail = vec2(u_trail.x * aspect, u_trail.y);
  vec2 rawDir = vec2(u_mouse_dir.x * aspect, u_mouse_dir.y);
  float dirLen = length(rawDir);
  vec2 dir = dirLen > 0.0001 ? rawDir / dirLen : vec2(1.0, 0.0);

  vec2 toCursor = st - cursor;
  vec2 toTrail = st - trail;
  float d = length(toCursor);
  float dt = length(toTrail);

  float speedBoost = clamp(u_mouse_speed * 2.2, 0.0, 1.6);
  float seedPeriod = 2.0;
  float seedTick = floor(u_time / seedPeriod);
  float seedMix = smoothstep(0.0, 1.0, fract(u_time / seedPeriod));
  float seedA0 = hash11(seedTick + 2.0);
  float seedB0 = hash11(seedTick + 19.0);
  float seedA1 = hash11(seedTick + 3.0);
  float seedB1 = hash11(seedTick + 20.0);
  float seedA = mix(seedA0, seedA1, seedMix);
  float seedB = mix(seedB0, seedB1, seedMix);
  vec2 jitterDir = normalize(vec2(seedA * 2.0 - 1.0, seedB * 2.0 - 1.0) + vec2(0.0001));

  vec2 chaoticSample = toCursor * (24.0 + seedA * 9.0) + jitterDir * (u_time * (1.8 + seedB * 1.2));
  float chaoticNoise = snoise(chaoticSample) * 0.7 + snoise(chaoticSample * 1.9 + vec2(4.1, 2.3)) * 0.3;
  float chaoticPulse = sin((d * (58.0 + seedB * 18.0)) - (u_time * (12.0 + seedA * 5.0)));
  float chaoticCore = chaoticNoise * chaoticPulse * exp(-d * (11.0 - seedA * 2.8));

  float along = dot(toCursor, dir);
  float side = dot(toCursor, vec2(-dir.y, dir.x));
  float cutWake = exp(-abs(side) * 36.0) * exp(-max(along, 0.0) * 3.5) * exp(-max(-along, 0.0) * 14.0);

  float radialShock = sin(d * 66.0 - u_time * 11.0 + seedB * 6.2831) * exp(-d * 14.0);
  float trailWave = (snoise(toTrail * 24.0 + vec2(u_time * 0.8, -u_time * 0.6)) * 0.7 + sin(dt * 42.0 - u_time * 6.0) * 0.3) * exp(-dt * 8.0);
  float bridgeDist = sdSegment(st, cursor, trail);
  float bridgeMask = exp(-bridgeDist * 48.0) * smoothstep(0.01, 0.25, length(cursor - trail));

  float localDisturbance = (chaoticCore * 0.14 + cutWake * 0.16 + radialShock * 0.08) * (1.0 + speedBoost) + trailWave * 0.08 + bridgeMask * 0.06;
  beamPos += localDisturbance;

  vec3 color = bgDark;
  float core = smoothstep(0.05, 0.0, beamPos) * smoothstep(-0.4, -0.05, beamPos);

  if (beamPos > -0.1 && beamPos < 0.8) {
    float t = (beamPos + 0.1) / 0.9;

    if (t < 0.2) {
      color = mix(pureWhite, violet, smoothstep(0.0, 0.2, t));
    } else if (t < 0.4) {
      color = mix(violet, cyan, smoothstep(0.2, 0.4, t));
    } else if (t < 0.6) {
      color = mix(cyan, yellow, smoothstep(0.4, 0.6, t));
    } else if (t < 0.9) {
      color = mix(yellow, red, smoothstep(0.6, 0.9, t));
    } else {
      color = mix(red, bgDark, smoothstep(0.9, 1.0, t));
    }
  }

  color = mix(color, pureWhite, core);

  float coreMask = exp(-d * 10.0);
  float trailMask = exp(-dt * 8.0) * 0.55;
  float disturbanceMask = clamp(coreMask * (1.0 + speedBoost * 0.5) + trailMask + bridgeMask * 0.65 + cutWake * 0.45, 0.0, 1.0);
  vec3 disturbanceTint = vec3(0.26, 0.45, 0.9);
  color += disturbanceTint * disturbanceMask * 0.34;
  color = mix(color, color * 0.68, disturbanceMask * 0.24);

  float grain = hash(st * 100.0 + u_time) * 0.15;
  color += grain;

  float vignette = length(vUv - 0.5);
  color = mix(color, color * 0.5, smoothstep(0.5, 0.8, vignette));

  gl_FragColor = vec4(color, 1.0);
}
`

const magneticCurtainsFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p *= 0.72;
  p.x *= u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse * 2.0 - 1.0;
  mouse *= 0.72;
  mouse.x *= u_resolution.x / u_resolution.y;

  vec2 dir = p - mouse;
  float dist = length(dir);
  float strength = 1.0 / (dist + 0.5);

  vec3 finalColor = vec3(0.0);

  for (float i = 0.0; i < 4.0; i++) {
    float t = u_time * (0.2 + i * 0.1);

    vec2 warp = p;
    warp.x += snoise(vec2(p.y * 1.2, t)) * 0.1 * strength;
    warp.y += snoise(vec2(p.x * 0.8, t * 0.5)) * 0.05;

    float stream = abs(snoise(vec2(warp.x * (2.0 + i), warp.y * 0.5 - t)));
    stream = pow(1.0 - stream, 12.0);

    float mask = smoothstep(0.8, 0.0, dist + snoise(warp * 2.0 + t) * 0.2);
    float curtain = stream * mask;

    vec3 col = mix(vec3(0.0, 0.3, 0.8), vec3(0.1, 1.0, 0.5), sin(i + t) * 0.5 + 0.5);
    finalColor += col * curtain * (1.2 / (i + 1.0));
  }

  float core = exp(-dist * 8.0);
  finalColor += vec3(0.4, 0.8, 1.0) * core;

  gl_FragColor = vec4(finalColor, 1.0);
}
`

const liquidAuroraOrbFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p *= 0.78;
  p.x *= u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse * 2.0 - 1.0;
  mouse *= 0.78;
  mouse.x *= u_resolution.x / u_resolution.y;

  vec3 cyan = vec3(0.0, 1.0, 0.9);
  vec3 lime = vec3(0.6, 1.0, 0.2);
  vec3 pink = vec3(0.8, 0.2, 0.8);
  vec3 whiteHighlight = vec3(1.0, 1.0, 1.0);

  float distToCenter = length(p);
  float distToMouse = length(p - mouse);

  vec2 warp = p;
  float pull = exp(-distToMouse * 3.0);
  warp -= normalize(p - mouse) * pull * 0.35 * sin(u_time * 2.0);

  float n1 = snoise(warp * 1.5 - u_time * 0.2);
  float n2 = snoise(warp * 3.0 + u_time * 0.3);
  float fluidNoise = (n1 + n2 * 0.5) * 0.5 + 0.5;

  float orbRadius = 1.12;
  float edgeThickness = 0.38;
  float edgeDist = distToCenter - orbRadius;
  edgeDist += fluidNoise * 0.15;

  float insideMask = 1.0 - smoothstep(-0.1, 0.0, edgeDist);
  float rimMask = smoothstep(-edgeThickness, 0.0, edgeDist) * smoothstep(0.1, 0.0, edgeDist);

  vec3 finalColor = vec3(0.0);
  vec3 auroraColor = mix(cyan, lime, smoothstep(0.3, 0.7, fluidNoise));
  auroraColor = mix(auroraColor, pink, smoothstep(0.7, 1.0, fluidNoise));

  float mouseGlow = exp(-distToMouse * 1.5);
  auroraColor = mix(auroraColor, whiteHighlight, mouseGlow * 0.5);

  vec3 coreColor = mix(vec3(0.0), vec3(0.05, 0.05, 0.1), length(warp) * 0.5);
  float specularInner = smoothstep(-0.02, 0.0, edgeDist) * smoothstep(0.02, 0.0, edgeDist);

  finalColor += coreColor * insideMask;

  float rimIntensity = rimMask * (fluidNoise * 0.8 + 0.2);
  float lightAngle = dot(normalize(warp), normalize(vec2(1.0, 1.0)));
  float directionalGlow = smoothstep(-1.0, 1.0, lightAngle);

  finalColor += auroraColor * rimIntensity * (directionalGlow + 0.5);
  finalColor += whiteHighlight * specularInner * 0.8 * fluidNoise;

  float ambientGlow = exp(-distToCenter * 1.5) * 0.05;
  finalColor += cyan * ambientGlow;

  gl_FragColor = vec4(finalColor, 1.0);
}
`

const prismaticCausticsFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 vUv;

float caustic(vec2 p, float time) {
  vec2 q = p;
  float c = 0.0;
  float amp = 0.4;
  for (float i = 1.0; i < 5.0; i++) {
    q += vec2(sin(time * 0.2 + q.y * i), cos(time * 0.3 + q.x * i));
    c += amp / length(q);
    amp *= 0.8;
  }
  return pow(c, 2.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
  p *= 0.72;
  vec2 mouse = (u_mouse - 0.5) * (u_resolution / min(u_resolution.y, u_resolution.x));
  mouse *= 0.72;

  float t = u_time * 0.8;

  float d = length(p - mouse);
  float ripple = sin(d * 25.0 - t * 4.0) * exp(-d * 3.0);
  vec2 distortedP = p + (normalize(p - mouse + 0.001) * ripple * 0.1);

  float r = caustic(distortedP * 1.1 + 0.01, t);
  float g = caustic(distortedP * 1.1, t);
  float b = caustic(distortedP * 1.1 - 0.01, t);

  vec3 color = vec3(r * 0.3, g * 0.6, b * 0.8);

  float highlight = smoothstep(0.0, 0.1, ripple) * 0.5;
  color += vec3(0.5, 0.9, 1.0) * highlight * caustic(distortedP * 3.0, t * 0.5);

  color = smoothstep(0.0, 1.5, color);
  color *= (1.0 - length(p) * 0.4);

  gl_FragColor = vec4(color, 1.0);
}
`

const dynamicOpenglGradientFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;

  vec2 m = u_mouse * 2.0 - 1.0;
  m.x *= u_resolution.x / u_resolution.y;

  float t = u_time * 0.25;

  float k = p.x * 1.5 + t;
  float wave = sin(k) * cos(k * 0.4 - t * 0.5) * 0.8;

  vec2 dirToMouse = m - p;
  float distToMouse = length(dirToMouse);
  float influence = exp(-distToMouse * distToMouse * 2.5);
  wave += influence * (m.y * 0.8 + sin(p.x * 4.0 - t * 2.0) * 0.2);

  float d = p.y - wave;
  float sideDist = abs(uv.x - 0.5) * 2.0;
  float blur = mix(0.015, 1.8, pow(sideDist, 2.5));

  float core = smoothstep(blur * 0.15, 0.0, abs(d));
  float innerGlow = smoothstep(blur * 0.8, 0.0, abs(d));
  float ambientGlow = exp(-abs(d) * mix(6.0, 0.8, sideDist));
  float topLight = smoothstep(0.0, blur * 2.5, d);
  float bottomShadow = smoothstep(0.0, blur * 4.0, -d);

  vec3 bgDark = vec3(0.01, 0.02, 0.06);
  vec3 deepBlue = vec3(0.03, 0.2, 0.45);
  vec3 brightCyan = vec3(0.2, 0.8, 1.0);
  vec3 pureWhite = vec3(1.0, 0.98, 0.95);

  vec3 color = bgDark;
  color = mix(color, deepBlue, ambientGlow * 0.7);
  color += deepBlue * topLight * 0.4;
  color = mix(color, brightCyan, innerGlow * 0.85);
  color = mix(color, pureWhite, core);
  color -= bottomShadow * vec3(0.1, 0.15, 0.2) * 0.8;

  float vignette = length(uv - 0.5) * 1.3;
  color *= 1.0 - pow(vignette, 2.5);

  float noise = hash(gl_FragCoord.xy + u_time);
  color += (noise - 0.5) * 0.035;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`

const monolithApertureFragmentShader = `
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
varying vec2 vUv;

float drawGeometry(vec2 uv, vec2 center, vec2 resolution) {
  vec2 p = uv - center;
  p.x *= resolution.x / resolution.y;

  float width = 0.008 + pow(abs(p.y), 2.8) * 0.15;
  float distToEdge = abs(p.x) - width;
  float maskY = smoothstep(0.45, 0.4, abs(p.y));
  float core = smoothstep(0.002, -0.001, distToEdge);
  float glow = exp(-max(distToEdge, 0.0) * 35.0);

  return (core + glow * 0.6) * maskY;
}

void main() {
  vec2 uv = vUv;
  vec2 lightCenter = u_mouse;

  const int SAMPLES = 50;
  float density = 1.1;
  float weight = 0.06;
  float decay = 0.96;
  float exposure = 1.3;

  vec2 texCoord = uv;
  vec2 deltaTextCoord = (texCoord - lightCenter) * (1.0 / float(SAMPLES)) * density;

  vec3 accumulatedLight = vec3(0.0);
  float illuminationDecay = 1.0;

  vec2 dirFromCenter = normalize(uv - lightCenter + vec2(0.00001));
  float distFromCenter = length(uv - lightCenter);
  float caStrength = distFromCenter * 0.025;

  for (int i = 0; i < SAMPLES; i++) {
    texCoord -= deltaTextCoord;

    float r = drawGeometry(texCoord - dirFromCenter * caStrength, lightCenter, u_resolution);
    float g = drawGeometry(texCoord, lightCenter, u_resolution);
    float b = drawGeometry(texCoord + dirFromCenter * caStrength, lightCenter, u_resolution);

    vec3 sampleColor = vec3(r, g, b);
    float sampleDepth = float(i) / float(SAMPLES);
    vec3 colorTint = mix(vec3(1.0, 0.98, 0.95), vec3(0.6, 0.8, 1.0), sampleDepth);
    sampleColor *= colorTint;
    sampleColor *= illuminationDecay * weight;
    accumulatedLight += sampleColor;
    illuminationDecay *= decay;
  }

  float coreR = drawGeometry(uv - dirFromCenter * caStrength * 0.5, lightCenter, u_resolution);
  float coreG = drawGeometry(uv, lightCenter, u_resolution);
  float coreB = drawGeometry(uv + dirFromCenter * caStrength * 0.5, lightCenter, u_resolution);
  vec3 baseGeometry = vec3(coreR, coreG, coreB);

  vec3 finalColor = (baseGeometry + accumulatedLight) * exposure;
  float noise = fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453);
  finalColor -= noise * distFromCenter * 0.04;

  float vignette = 1.0 - smoothstep(0.2, 1.4, length(uv - vec2(0.5)));
  finalColor *= vignette;

  finalColor = (finalColor * (2.51 * finalColor + 0.03)) / (finalColor * (2.43 * finalColor + 0.59) + 0.14);
gl_FragColor = vec4(finalColor, 1.0);
}
`

const kineticTopographyFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_pixelRatio;

varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
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
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 x) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 5; ++i) {
    v += a * snoise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float dither8x8(vec2 position, float brightness) {
  int x = int(mod(position.x, 8.0));
  int y = int(mod(position.y, 8.0));
  float limit = 0.5;
  if(x==0&&y==0) limit=0.015625; else if(x==4&&y==0) limit=0.515625; else if(x==2&&y==4) limit=0.140625; else if(x==6&&y==4) limit=0.640625;
  else if(x==4&&y==4) limit=0.765625; else if(x==0&&y==4) limit=0.265625; else if(x==6&&y==0) limit=0.890625; else if(x==2&&y==0) limit=0.390625;
  else if(x==2&&y==2) limit=0.078125; else if(x==6&&y==2) limit=0.578125; else if(x==0&&y==6) limit=0.203125; else if(x==4&&y==6) limit=0.703125;
  else if(x==6&&y==6) limit=0.828125; else if(x==2&&y==6) limit=0.328125; else if(x==4&&y==2) limit=0.953125; else if(x==0&&y==2) limit=0.453125;
  else if(x==1&&y==1) limit=0.046875; else if(x==5&&y==1) limit=0.546875; else if(x==3&&y==5) limit=0.171875; else if(x==7&&y==5) limit=0.671875;
  else if(x==5&&y==5) limit=0.796875; else if(x==1&&y==5) limit=0.296875; else if(x==7&&y==1) limit=0.921875; else if(x==3&&y==1) limit=0.421875;
  else if(x==3&&y==3) limit=0.109375; else if(x==7&&y==3) limit=0.609375; else if(x==1&&y==7) limit=0.234375; else if(x==5&&y==7) limit=0.734375;
  else if(x==7&&y==7) limit=0.859375; else if(x==3&&y==7) limit=0.359375; else if(x==5&&y==3) limit=0.984375; else if(x==1&&y==3) limit=0.484375;
  return brightness < limit ? 0.0 : 1.0;
}

void main() {
  vec2 uv = vUv;
  vec2 st = uv * 2.0 - 1.0;
  st.x *= u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse * 2.0 - 1.0;
  mouse.x *= u_resolution.x / u_resolution.y;

  float dist = length(st - mouse);
  float ripple = sin(dist * 10.0 - u_time * 3.0) * 0.5 + 0.5;
  float interaction = exp(-dist * 3.0) * ripple;

  vec2 q = vec2(0.0);
  q.x = fbm(st + 0.00 * u_time);
  q.y = fbm(st + vec2(1.0));

  vec2 r = vec2(0.0);
  r.x = fbm(st + 1.0*q + vec2(1.7, 9.2) + 0.15*u_time + interaction * 0.5);
  r.y = fbm(st + 1.0*q + vec2(8.3, 2.8) + 0.126*u_time);

  float f = fbm(st + r);

  vec3 color = mix(vec3(0.01, 0.02, 0.03), vec3(0.1, 0.2, 0.3), clamp((f*f)*4.0, 0.0, 1.0));
  color = mix(color, vec3(0.2, 0.1, 0.25), clamp(length(q), 0.0, 1.0));
  color = mix(color, vec3(0.4, 0.6, 0.7), clamp(length(r.x), 0.0, 1.0));
  color += vec3(0.1, 0.2, 0.3) * interaction;

  float brightness = dot(color, vec3(0.299, 0.587, 0.114));
  brightness = smoothstep(0.1, 0.7, brightness);

  vec2 pixelCoord = gl_FragCoord.xy * u_pixelRatio;
  float dithered = dither8x8(pixelCoord * 0.5, brightness * 1.2);

  vec3 finalColor = vec3(0.02, 0.03, 0.04);
  if (dithered > 0.5) {
    if (brightness > 0.6) finalColor = vec3(0.7, 0.8, 0.9);
    else if (brightness > 0.4) finalColor = vec3(0.3, 0.5, 0.6);
    else if (brightness > 0.2) finalColor = vec3(0.2, 0.15, 0.3);
    else finalColor = vec3(0.05, 0.08, 0.1);
  }

  float vignette = length(uv - 0.5);
  finalColor *= smoothstep(0.8, 0.2, vignette);

gl_FragColor = vec4(finalColor, 1.0);
}
`

const spectralDynamicsFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
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

float fbm(vec2 x) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
  for (int i = 0; i < 5; ++i) {
    v += a * snoise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float bayer8x8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int bayer[64] = int[64](
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
  );
  return float(bayer[x + y * 8]) / 64.0;
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  st.x *= u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse;
  mouse.x *= u_resolution.x / u_resolution.y;

  float dist = distance(st, mouse);
  float mouseForce = exp(-dist * 3.0);

  vec2 q = vec2(0.0);
  q.x = fbm(st + 0.00 * u_time);
  q.y = fbm(st + vec2(1.0));

  vec2 r = vec2(0.0);
  r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
  r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time);
  r += mouseForce * 1.2;

  float ripple = sin(dist * 15.0 - u_time * 3.0) * mouseForce;
  float ripple2 = sin(dist * 25.0 - u_time * 5.0 + 1.5) * mouseForce * 0.5;
  float waveIntensity = (ripple + ripple2) * 0.4;

  float f = fbm(st + r + waveIntensity);

  vec3 col = vec3(0.0);
  col = mix(vec3(0.0, 0.0, 0.0), vec3(0.36, 0.22, 0.13), clamp((f*f)*4.0, 0.0, 1.0));
  col = mix(col, vec3(0.45, 0.34, 0.55), clamp(length(q), 0.0, 1.0));
  col = mix(col, vec3(0.54, 0.63, 0.85), clamp(length(r.x), 0.0, 1.0));

  col += vec3(0.8, 0.9, 1.0) * abs(waveIntensity) * 2.0;

  float core = pow(f, 3.0) * 2.0;
  col += vec3(1.0, 0.92, 0.82) * core;
  col += vec3(1.0, 0.6, 0.3) * mouseForce * 2.5;

  float edgeMask = smoothstep(0.0, 0.3, st.y) * smoothstep(1.0, 0.7, st.y) *
    smoothstep(0.0, 0.3, st.x) * smoothstep(1.0, 0.7, st.x);
  col = mix(col * 0.3, col, edgeMask);

  float scanline = sin(gl_FragCoord.y * 1.5) * 0.04;
  col -= scanline;

  float dither = bayer8x8(gl_FragCoord.xy) - 0.5;
  float steps = 8.0;
  col = col + dither * (1.0 / steps);
  col = floor(col * steps + 0.5) / steps;

  float vig = length(st - vec2(0.5 * (u_resolution.x / u_resolution.y), 0.5));
  col *= 1.0 - vig * 0.6;

gl_FragColor = vec4(col, 1.0);
}
`

const progressiveBlinderFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 vUv;

const vec3 COLOR_BG = vec3(0.00, 0.01, 0.005);
const vec3 COLOR_DARK = vec3(0.008, 0.067, 0.047);
const vec3 COLOR_MID = vec3(0.059, 0.349, 0.271);
const vec3 COLOR_BRIGHT = vec3(0.443, 0.851, 0.725);
const vec3 COLOR_CORE = vec3(0.85, 1.0, 0.95);

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;

  vec2 mouse = u_mouse;
  vec2 delta = mouse - vec2(0.5);

  vec2 lightCenter = vec2(0.5) + delta * 0.25;
  vec2 nuv = uv - lightCenter;

  float numStripes = 16.0;
  float perspective = delta.x * (uv.y - 0.5) * 0.08;
  float x = (uv.x + perspective) * numStripes;

  float stripeFx = fract(x);

  vec2 uvAspect = vec2(uv.x * aspect, uv.y);
  vec2 lightCenterAspect = vec2(lightCenter.x * aspect, lightCenter.y);
  vec2 nuvAspect = uvAspect - lightCenterAspect;

  float lightY = exp(-pow(abs(nuv.y) * 2.4, 2.0));
  float lightX = exp(-pow(abs(nuvAspect.x) * 2.8, 2.0));
  float globalLight = lightY * lightX;

  float coreDist = length(vec2(nuvAspect.x * 4.0, nuv.y * 2.0));
  float coreLight = exp(-pow(coreDist, 2.0) * 2.5);

  float blinderShading = mix(0.15, 1.3, pow(stripeFx, 0.85));
  float edgeShadow = smoothstep(0.0, 0.05, stripeFx) * smoothstep(1.0, 0.95, stripeFx);
  blinderShading *= mix(0.5, 1.0, edgeShadow);

  float intensity = (globalLight * 0.85 + coreLight * 0.6) * blinderShading;
  intensity *= 1.0 + sin(u_time * 1.5) * 0.03;

  vec3 color = COLOR_BG;
  float t1 = smoothstep(0.0, 0.15, intensity);
  float t2 = smoothstep(0.15, 0.45, intensity);
  float t3 = smoothstep(0.45, 0.9, intensity);
  float t4 = smoothstep(0.9, 1.4, intensity);

  color = mix(color, COLOR_DARK, t1);
  color = mix(color, COLOR_MID, t2);
  color = mix(color, COLOR_BRIGHT, t3);
  color = mix(color, COLOR_CORE, t4);

  vec2 centerDist = uv - vec2(0.5);
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(centerDist));
  color *= mix(0.6, 1.0, vignette);

  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) * 0.015;

gl_FragColor = vec4(color, 1.0);
}
`

const spatialLightFragmentShader = `
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 vUv;

vec3 calculatePlane(vec2 uv, float side, vec2 mouseNorm) {
  float gap = 0.25 + (mouseNorm.y * 0.1);
  float angle = 0.45 + (mouseNorm.x * side * 0.15);
  float edgePositionX = gap + abs(uv.y) * angle;
  float distanceToEdge = (uv.x * side) - edgePositionX;

  if (distanceToEdge < 0.0) {
    return vec3(0.0);
  }

  float spreadBase = 2.0 + (mouseNorm.y + 1.0) * 1.5;
  float softening = max(0.4, spreadBase - (distanceToEdge * 1.5));

  float coreGlow = exp(-distanceToEdge * 25.0);
  float midGlow = exp(-distanceToEdge * softening * 3.0);
  float outerGlow = exp(-distanceToEdge * softening * 0.8);

  vec3 colorCore = vec3(1.0, 0.98, 0.96);
  vec3 colorMid = vec3(0.0, 0.5, 1.0);
  vec3 colorOuter = vec3(0.02, 0.1, 0.8);

  float ribTexture = sin(uv.y * 200.0) * 0.5 + 0.5;

  vec3 finalColor = (coreGlow * colorCore * 1.8) +
                    (midGlow * colorMid * 1.4 * (ribTexture * 0.1 + 0.9)) +
                    (outerGlow * colorOuter * 0.9);

  return finalColor;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  vec2 mouseNorm = u_mouse * 2.0 - 1.0;
  vec2 backgroundColor = vec2(0.0);
  vec3 bg = vec3(0.01, 0.01, 0.04);
  bg -= length(uv) * vec3(0.005, 0.005, 0.02);

  vec3 leftPlane = calculatePlane(uv, -1.0, mouseNorm);
  vec3 rightPlane = calculatePlane(uv, 1.0, mouseNorm);

  vec3 sceneColor = bg + leftPlane + rightPlane;

  float centerGlow = exp(-length(vec2(uv.x, uv.y * 0.5)) * 3.0) * 0.05;
  sceneColor += vec3(centerGlow * 0.5, centerGlow * 0.8, centerGlow);

  sceneColor = vec3(1.0) - exp(-sceneColor * 1.2);

  gl_FragColor = vec4(sceneColor, 1.0);
}
`

export const SHADER_LIBRARY = [
  {
    id: 'magnetic-curtains',
    name: 'Magnetic Curtains',
    mode: 'shader',
    fragmentShader: magneticCurtainsFragmentShader,
    defaultControls: {
      colorA: '#16f2de',
      colorB: '#0a7dff',
      colorC: '#031322',
    },
  },
  {
    id: 'liquid-aurora-orb',
    name: 'Liquid Aurora Orb',
    mode: 'shader',
    fragmentShader: liquidAuroraOrbFragmentShader,
    defaultControls: {
      colorA: '#00ffe5',
      colorB: '#8be35a',
      colorC: '#f0f5ff',
    },
    noiseOverlay: {
      baseFrequency: 0.8,
      opacity: 0.03,
    },
  },
  {
    id: 'prismatic-caustics',
    name: 'Prismatic Caustics',
    mode: 'shader',
    fragmentShader: prismaticCausticsFragmentShader,
    defaultControls: {
      colorA: '#4ea4ff',
      colorB: '#9b7cff',
      colorC: '#ffeaa7',
    },
    noiseOverlay: {
      baseFrequency: 0.7,
      opacity: 0.04,
    },
  },
  {
    id: 'miracle-led-ripples',
    name: 'Miracle LED Ripples',
    mode: 'canvas2d-led',
    defaultControls: {
      colorA: '#7dd3fc',
      colorB: '#ffffff',
      colorC: '#22d3ee',
    },
    noiseOverlay: {
      baseFrequency: 0.7,
      opacity: 0.04,
    },
  },
  {
    id: 'dynamic-opengl-gradient',
    name: 'Dynamic OpenGL Gradient',
    mode: 'shader',
    fragmentShader: dynamicOpenglGradientFragmentShader,
    mouseLerp: 0.05,
    defaultControls: {
      colorA: '#0b2fff',
      colorB: '#6ecbff',
      colorC: '#ffffff',
    },
  },
  {
    id: 'meditative-webgl-ripples',
    name: 'Meditative WebGL Ripples',
    mode: 'three-meditative-ripples',
    defaultControls: {
      colorA: '#f4f7fa',
      colorB: '#d1dbe5',
      colorC: '#ffffff',
    },
    vignetteOverlay: {
      background:
        'radial-gradient(circle at center, transparent 40%, rgba(230, 235, 240, 0.4) 100%)',
    },
  },
  {
    id: 'monolith-aperture',
    name: 'Monolith Aperture',
    mode: 'shader',
    fragmentShader: monolithApertureFragmentShader,
    mouseLerp: 0.08,
    defaultControls: {
      colorA: '#f7f5f2',
      colorB: '#9ab6ff',
      colorC: '#5f6b85',
    },
  },
  {
    id: 'interactive-displacement-blob',
    name: 'Interactive Displacement Blob',
    mode: 'three-displacement-blob',
    defaultControls: {
      colorA: '#ffffff',
      colorB: '#e0dcd3',
      colorC: '#c9bcae',
    },
  },
  {
    id: 'ditherfx-object',
    name: 'DitherFX Object',
    mode: 'three-ditherfx-object',
    defaultControls: {
      colorA: '#ffffff',
      colorB: '#60a5fa',
      colorC: '#3b82f6',
      ditherBgColor: '#3b82f6',
    },
    noiseOverlay: {
      baseFrequency: 0.65,
      opacity: 0.025,
    },
  },
  {
    id: 'kinetic-topography',
    name: 'Kinetic Topography',
    mode: 'shader',
    fragmentShader: kineticTopographyFragmentShader,
    mouseLerp: 0.05,
    defaultControls: {
      colorA: '#b7c9de',
      colorB: '#4a7ea8',
      colorC: '#11182a',
    },
    vignetteOverlay: {
      background:
        'radial-gradient(circle at center, transparent 34%, rgba(3, 4, 6, 0.5) 68%, rgba(3, 4, 6, 0.82) 100%)',
    },
    noiseOverlay: {
      baseFrequency: 0.55,
      opacity: 0.02,
    },
  },
  {
    id: 'aetheria-nebula',
    name: 'Aetheria Nebula',
    mode: 'three-nebula',
    defaultControls: {
      colorA: '#a78bfa',
      colorB: '#6366f1',
      colorC: '#f472b6',
    },
    noiseOverlay: {
      baseFrequency: 0.45,
      opacity: 0.018,
    },
  },
  {
    id: 'spectral-dynamics',
    name: 'Spectral Dynamics',
    mode: 'shader',
    fragmentShader: spectralDynamicsFragmentShader,
    mouseLerp: 0.05,
    defaultControls: {
      colorA: '#ffd7b2',
      colorB: '#8aa0d9',
      colorC: '#3d2a43',
    },
    noiseOverlay: {
      baseFrequency: 0.38,
      opacity: 0.018,
    },
    vignetteOverlay: {
      background:
        'radial-gradient(circle at center, transparent 24%, rgba(0, 0, 0, 0.18) 58%, rgba(0, 0, 0, 0.48) 100%)',
    },
  },
  {
    id: 'progressive-blinder',
    name: 'Progressive Blinder',
    mode: 'shader',
    fragmentShader: progressiveBlinderFragmentShader,
    mouseLerp: 0.08,
    defaultControls: {
      colorA: '#8efde2',
      colorB: '#0f7a66',
      colorC: '#02140f',
    },
    noiseOverlay: {
      baseFrequency: 0.24,
      opacity: 0.012,
    },
  },
  {
    id: 'spatial-light',
    name: 'Spatial Light',
    mode: 'shader',
    fragmentShader: spatialLightFragmentShader,
    mouseLerp: 0.08,
    defaultControls: {
      colorA: '#ffffff',
      colorB: '#467eff',
      colorC: '#02081d',
    },
    noiseOverlay: {
      baseFrequency: 0.8,
      opacity: 0.03,
    },
  },
  {
    id: 'reactant-field',
    name: 'Reactant Field',
    mode: 'webgl2-reactant-field',
    defaultControls: {
      colorA: '#ffffff',
      colorB: '#ff7a00',
      colorC: '#2b0a05',
    },
    noiseOverlay: {
      baseFrequency: 0.18,
      opacity: 0.012,
    },
  },
  {
    id: 'ripped-ascii-topology',
    name: 'Ripped ASCII Topology',
    mode: 'canvas2d-ripped-ascii',
    defaultControls: {
      colorA: '#e8e6e0',
      colorB: '#9da3af',
      colorC: '#0a0a0a',
    },
  },
]

export const DEFAULT_SHADER_ID = SHADER_LIBRARY[0].id

export function getShaderDefaultControls(shaderId) {
  const shader = SHADER_LIBRARY.find((item) => item.id === shaderId)
  return {
    ...DEFAULT_SHADER_CONTROLS,
    ...(shader?.defaultControls ?? {}),
  }
}

export const COMPONENT_FAMILY_META = {
  field: { label: 'Field', color: '#67e8f9' },
  motion: { label: 'Motion', color: '#93c5fd' },
  interaction: { label: 'Interaction', color: '#f9a8d4' },
  structure: { label: 'Structure', color: '#fcd34d' },
  texture: { label: 'Texture', color: '#86efac' },
  post: { label: 'Post FX', color: '#c4b5fd' },
}

export const PRESET_COMPONENT_BREAKDOWN = {
  'magnetic-curtains': {
    families: ['field', 'motion', 'interaction'],
    summary: 'Layered aurora curtains pulled by magnetic cursor force vectors.',
    components: ['Curtain Ribbons', 'Magnetic Warp', 'Distance Mask', 'Core Focus Glow'],
  },
  'liquid-aurora-orb': {
    families: ['field', 'structure', 'interaction', 'texture'],
    summary: 'Frosted orb rim with fluid chroma noise and directional glow response.',
    components: ['Orb Rim SDF', 'Fluid Boundary Noise', 'Mouse Pull Warp', 'Specular Frost Edge'],
  },
  'prismatic-caustics': {
    families: ['field', 'motion', 'interaction', 'texture'],
    summary: 'Refractive caustic mesh with chromatic split and ripple-driven highlights.',
    components: ['Caustic Wave Iteration', 'RGB Dispersion', 'Ripple Refraction', 'Vignette Attenuation'],
  },
  'miracle-led-ripples': {
    families: ['structure', 'interaction', 'motion', 'texture'],
    summary: 'LED particle grid simulation where cursor stamps energetic ripple waves.',
    components: ['Grid Solver Buffers', 'Brush Injection', 'Ambient Wave Layer', 'Point Glow Raster'],
  },
  'dynamic-opengl-gradient': {
    families: ['field', 'interaction', 'structure', 'post'],
    summary: 'Folded luminous plane with progressive edge blur and cursor-tension wave.',
    components: ['Fold Curve SDF', 'Progressive Blur Falloff', 'Directional Shade', 'Film Noise'],
  },
  'meditative-webgl-ripples': {
    families: ['field', 'interaction', 'motion', 'post'],
    summary: 'Calm reflective water plane with droplet stamping and vignette blur postprocess.',
    components: ['Ripple Height Function', 'Drop Timeline Slots', 'Sky Reflection Model', 'Vignette Blur Pass'],
  },
  'monolith-aperture': {
    families: ['structure', 'field', 'interaction', 'post'],
    summary: 'Raymarched slit aperture with chromatic bleed and cinematic tonemapping.',
    components: ['Aperture Geometry SDF', 'Volumetric Raymarch', 'Chromatic Aberration', 'ACES Tone Map'],
  },
  'interactive-displacement-blob': {
    families: ['structure', 'motion', 'interaction', 'texture'],
    summary: 'Noisy refractive blob with iridescent fresnel and cursor steering.',
    components: ['Displaced Icosahedron', 'Procedural Normals', 'Iridescent Fresnel', 'Micro Surface Noise'],
  },
  'ditherfx-object': {
    families: ['structure', 'texture', 'interaction', 'post'],
    summary: 'Dithered sculptural geometry with palette quantization and angular lighting.',
    components: ['Geometry Presets', 'Bayer Dither Pattern', 'Tri-Band Palette', 'Cursor Orbit Control'],
  },
  'kinetic-topography': {
    families: ['field', 'interaction', 'texture', 'post'],
    summary: 'Topographic fluid field with hard dither bands and telemetry-style output.',
    components: ['FBM Field Stack', 'Cursor Ripple Injection', 'Ordered Dither Matrix', 'Center Vignette'],
  },
  'aetheria-nebula': {
    families: ['field', 'motion', 'interaction', 'texture'],
    summary: 'Layered deep-space nebula with particle starfield and parallax camera drift.',
    components: ['Nebula FBM Volume', 'Mouse Lens Warp', 'Starfield Twinkle', 'Additive Glow Layer'],
  },
  'spectral-dynamics': {
    families: ['field', 'interaction', 'texture', 'post'],
    summary: 'Spectral fluid shader with CRT-style scanlines and quantized shimmer response.',
    components: ['Spectral Field Blend', 'Wave Distortion Rings', 'Bayer Quantization', 'Scanline Pass'],
  },
  'progressive-blinder': {
    families: ['structure', 'field', 'interaction', 'post'],
    summary: 'Architectural blinder planes with hard edge cores and soft atmospheric spread.',
    components: ['Blinder Stripe Geometry', 'Perspective Shear', 'Edge Core Lighting', 'Corner Vignette'],
  },
  'spatial-light': {
    families: ['structure', 'field', 'interaction', 'texture'],
    summary: 'Dual opposing luminous planes with depth ribs and cursor-angle steering.',
    components: ['Opposing Plane SDF', 'Progressive Softening', 'Ribbed Light Texture', 'Center Ambient Glow'],
  },
  'reactant-field': {
    families: ['structure', 'interaction', 'motion', 'post'],
    summary: 'WebGL2 reaction trail simulation rendered through a rounded-grid luminescence matrix.',
    components: ['Ping-Pong Simulation', 'Velocity Brush Burst', 'Rounded Cell Grid', 'Thermal Palette Mapping'],
  },
  'ripped-ascii-topology': {
    families: ['structure', 'texture', 'interaction', 'motion'],
    summary: 'Ripped ASCII strata where cursor tears through layered wave-bands.',
    components: ['ASCII Wave Bands', 'Tear Noise Threshold', 'Glitch Accent Strips', 'Cursor Displacement Field'],
  },
}

export const DEFAULT_SHADER_CONTROLS = {
  rotation: 0,
  cursorMovement: 1,
  cursorReaction: 1,
  cursorSize: 1,
  effectSize: 1,
  scale: 1,
  positionX: 0,
  positionY: 0,
  cursorOffsetX: 0,
  cursorOffsetY: 0,
  speed: 1,
  curves: 0.5,
  turbulence: 0.5,
  softness: 0.5,
  blur: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hueShift: 0,
  opacity: 1,
  vignette: 0.4,
  grain: 0.5,
  colorA: '#7dd3fc',
  colorB: '#f8fafc',
  colorC: '#f9a8d4',
  ditherBgColor: '#3b82f6',
  geometryPreset: 'torus',
  shapePreset: 'default',
  blendMode: 'screen',
}

export const SHADER_CONTROL_SECTIONS = [
  {
    title: 'Transform',
    controls: [
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1 },
      { key: 'effectSize', label: 'Effect Size', type: 'range', min: 0.5, max: 2.5, step: 0.01 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2.5, step: 0.01 },
      { key: 'positionX', label: 'Position X', type: 'range', min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'Position Y', type: 'range', min: -1, max: 1, step: 0.01 },
      {
        key: 'geometryPreset',
        label: 'Geometry',
        type: 'select',
        options: [
          { value: 'torus', label: 'Torus' },
          { value: 'sphere', label: 'Sphere' },
          { value: 'knot', label: 'Knot' },
          { value: 'shard', label: 'Shard' },
        ],
      },
    ],
  },
  {
    title: 'Cursor',
    controls: [
      { key: 'cursorMovement', label: 'Cursor Movement', type: 'range', min: 0, max: 2, step: 0.01 },
      { key: 'cursorReaction', label: 'Cursor Reaction', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'cursorSize', label: 'Cursor Size', type: 'range', min: 0.2, max: 3, step: 0.01 },
      { key: 'cursorOffsetX', label: 'Cursor Offset X', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'cursorOffsetY', label: 'Cursor Offset Y', type: 'range', min: -0.5, max: 0.5, step: 0.01 },
    ],
  },
  {
    title: 'Motion',
    controls: [
      { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'curves', label: 'Curves', type: 'range', min: 0, max: 1.5, step: 0.01 },
      { key: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 1.5, step: 0.01 },
      { key: 'softness', label: 'Softness', type: 'range', min: 0, max: 1.5, step: 0.01 },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: 'Color',
    controls: [
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.4, max: 2, step: 0.01 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0.4, max: 2, step: 0.01 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'hueShift', label: 'Hue Shift', type: 'range', min: -180, max: 180, step: 1 },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.15, max: 1, step: 0.01 },
      { key: 'blur', label: 'Blur', type: 'range', min: 0, max: 24, step: 0.1 },
      { key: 'colorA', label: 'Color A', type: 'color' },
      { key: 'colorB', label: 'Color B', type: 'color' },
      { key: 'colorC', label: 'Color C', type: 'color' },
      { key: 'ditherBgColor', label: 'BG Color', type: 'color' },
    ],
  },
  {
    title: 'Shape',
    controls: [
      {
        key: 'shapePreset',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'orb', label: 'Orb' },
          { value: 'slit', label: 'Slit' },
          { value: 'ribbon', label: 'Ribbon' },
          { value: 'shard', label: 'Shard' },
        ],
      },
      {
        key: 'blendMode',
        label: 'Blend Mode',
        type: 'select',
        options: [
          { value: 'screen', label: 'Screen' },
          { value: 'soft-light', label: 'Soft Light' },
          { value: 'color-dodge', label: 'Color Dodge' },
          { value: 'overlay', label: 'Overlay' },
        ],
      },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
]
