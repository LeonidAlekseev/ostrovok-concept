import { GLOBE_CENTER, type GlobePoint } from '../../lib/globe'

/** Southern edge of the cropped texture (keep in sync with TEXTURE_LAT_MIN in scripts/build-images.py). */
const TEXTURE_LAT_MIN = -20

const vertexSource = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

// Same orthographic projection and shading as render_globe() in scripts/build-images.py,
// so the live globe matches the poster image it replaces.
const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
// sin and cos of the view latitude.
uniform vec2 uLat0;
uniform float uLon0;
uniform float uLatMin;
uniform float uPixel;
// View-space position of the spotlighted city (xyz) and its glow strength (w).
uniform vec4 uCity;
const float PI = 3.14159265;
const vec3 LIGHT = normalize(vec3(0.45, 0.55, 0.70));
// 1 - cos of the glow's angular radius, 0.16 rad: as wide as the CSS glow it replaced.
const float GLOW_RADIUS = 0.0128;
const vec3 GLOW_CORE = vec3(1.0, 0.925, 0.55) * 0.55;
const vec3 GLOW_EDGE = vec3(0.63, 1.0, 0.47) * 0.25;

void main() {
  float u = vUv.x, v = vUv.y;
  float rho = length(vUv);
  float alpha = 1.0 - smoothstep(1.0 - uPixel, 1.0 + uPixel, rho);
  if (alpha <= 0.0) discard;
  float z = sqrt(max(1.0 - rho * rho, 0.0));

  float lat = asin(clamp(z * uLat0.x + v * uLat0.y, -1.0, 1.0));
  float lon = uLon0 + atan(u, z * uLat0.y - v * uLat0.x);
  float s = lon / (2.0 * PI) + 0.5;
  float t = (PI / 2.0 - lat) / (PI / 2.0 - uLatMin);

  // Take derivatives from whichever wrap of s is continuous here to avoid a mip seam at the date line.
  float s1 = fract(s), s2 = fract(s + 0.5) - 0.5;
  vec2 g1 = vec2(dFdx(s1), dFdy(s1)), g2 = vec2(dFdx(s2), dFdy(s2));
  vec2 gs = dot(g1, g1) < dot(g2, g2) ? g1 : g2;
  vec3 c = textureGrad(uTex, vec2(s1, t), vec2(gs.x, dFdx(t)), vec2(gs.y, dFdy(t))).rgb;

  float diffuse = clamp(dot(vec3(u, v, z), LIGHT), 0.0, 1.0);
  c *= 0.55 + 0.75 * diffuse;
  float haze = pow(1.0 - z, 2.2);
  c = c * (1.0 - 0.65 * haze) + vec3(0.38, 0.66, 1.0) * 0.75 * haze;
  c = clamp(c, 0.0, 1.0);

  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(gray), c, 1.25), 0.0, 1.0);
  c = clamp(mix(vec3(0.4), c, 1.08), 0.0, 1.0);

  // Pool of light around the spotlighted city, screen-blended; it follows the sphere's curvature.
  float r = sqrt(max(1.0 - dot(vec3(u, v, z), uCity.xyz), 0.0) / GLOW_RADIUS);
  vec3 glow = r < 0.5 ? mix(GLOW_CORE, GLOW_EDGE, r * 2.0) : mix(GLOW_EDGE, vec3(0.0), min(r * 2.0 - 1.0, 1.0));
  c += glow * uCity.w * (1.0 - c);

  // Interleaved gradient noise of one 8-bit step hides banding in the haze and the terminator.
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  outColor = vec4(c * alpha, alpha);
}`

export interface GlobeFrame {
  centerLon: number
  /** Canvas size, CSS pixels. */
  size: number
  /** Top fraction of the canvas that is on screen; only it is rasterised. */
  visibleFraction: number
  /** Canvas pixels per CSS pixel. */
  pixelRatio: number
  /** Spotlighted city and the strength of the light pool around it, 0…1. */
  city: GlobePoint
  cityGlow: number
}

export interface GlobeRenderer {
  /** Resolves once the texture is uploaded and frames can be drawn. */
  ready: Promise<void>
  /** Draws a frame; returns false when nothing changed since the previous one and drawing was skipped. */
  draw(frame: GlobeFrame): boolean
  /** GPU name and texture details for the technical overlay. */
  describe(): { gpu: string; texture: string; canvas: string }
  dispose(): void
}

/** WebGL 2 globe renderer, or null when WebGL 2 is unavailable (the static poster stays then). */
export function createGlobeRenderer(
  canvas: HTMLCanvasElement,
  texture: { small: string; large: string; useLarge: boolean },
) {
  // A full-screen shader pass gains nothing from the discrete GPU on dual-GPU laptops; spare the battery.
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  })
  if (!gl) return null

  const program = linkProgram(gl)
  if (!program) return null
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const uLon0 = uniform('uLon0')
  const uPixel = uniform('uPixel')
  const uCity = uniform('uCity')
  const lat0 = (GLOBE_CENTER.lat * Math.PI) / 180
  gl.uniform2f(uniform('uLat0'), Math.sin(lat0), Math.cos(lat0))
  gl.uniform1f(uniform('uLatMin'), (TEXTURE_LAT_MIN * Math.PI) / 180)
  gl.uniform1i(uniform('uTex'), 0)

  const glTexture = gl.createTexture()
  let textureSize = ''
  let drawn = ''
  let disposed = false

  const ready = (async () => {
    const image = new Image()
    image.decoding = 'async'
    image.src = texture.useLarge && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096 ? texture.large : texture.small
    await image.decode()
    if (disposed) return
    textureSize = `${image.naturalWidth}×${image.naturalHeight}`
    gl.bindTexture(gl.TEXTURE_2D, glTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  })()

  return {
    ready,
    draw({ centerLon, size, visibleFraction, pixelRatio, city, cityGlow }) {
      const px = Math.round(size * pixelRatio)
      const visible = Math.ceil(px * Math.min(Math.max(visibleFraction, 0), 1))
      // A standing globe (hover, reduced motion) costs no GPU time at all.
      const key = `${centerLon}/${px}/${visible}/${city.x}/${city.y}/${cityGlow}`
      if (key === drawn && canvas.width === px) return false
      drawn = key
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      gl.viewport(0, 0, px, px)
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(0, px - visible, px, visible)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uLon0, (centerLon * Math.PI) / 180)
      gl.uniform1f(uPixel, 1.5 / px)
      gl.uniform4f(uCity, city.x / 50 - 1, 1 - city.y / 50, city.depth, cityGlow)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return true
    },
    describe() {
      const debug = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        gpu: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
        texture: textureSize || 'loading',
        canvas: `${canvas.width}×${canvas.height}`,
      }
    },
    dispose() {
      disposed = true
      gl.deleteTexture(glTexture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  } satisfies GlobeRenderer
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  console.error('Globe shader failed to link:', gl.getProgramInfoLog(program))
  gl.deleteProgram(program)
  return null
}
