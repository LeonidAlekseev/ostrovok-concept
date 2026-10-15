import { GLOBE_CENTER } from '../../lib/globe'

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
uniform float uLat0;
uniform float uLon0;
uniform float uLatMin;
uniform float uPixel;
const float PI = 3.14159265;
const vec3 LIGHT = normalize(vec3(0.45, 0.55, 0.70));

void main() {
  float u = vUv.x, v = vUv.y;
  float rho = length(vUv);
  float alpha = 1.0 - smoothstep(1.0 - uPixel, 1.0 + uPixel, rho);
  if (alpha <= 0.0) discard;
  float z = sqrt(max(1.0 - rho * rho, 0.0));

  float lat = asin(clamp(z * sin(uLat0) + v * cos(uLat0), -1.0, 1.0));
  float lon = uLon0 + atan(u, z * cos(uLat0) - v * sin(uLat0));
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
  outColor = vec4(c * alpha, alpha);
}`

export interface GlobeRenderer {
  /** Resolves once the texture is uploaded and frames can be drawn. */
  ready: Promise<void>
  /**
   * Draws the globe centred on `centerLon` into a canvas of `size` CSS pixels;
   * only the top `visibleFraction` of it is rasterised.
   */
  draw(centerLon: number, size: number, visibleFraction: number): void
  dispose(): void
}

/** WebGL 2 globe renderer, or null when WebGL 2 is unavailable (the static poster stays then). */
export function createGlobeRenderer(canvas: HTMLCanvasElement, textures: { small: string; large: string }) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true })
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
  gl.uniform1f(uniform('uLat0'), (GLOBE_CENTER.lat * Math.PI) / 180)
  gl.uniform1f(uniform('uLatMin'), (TEXTURE_LAT_MIN * Math.PI) / 180)
  gl.uniform1i(uniform('uTex'), 0)

  const texture = gl.createTexture()
  let disposed = false

  const ready = (async () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const wantLarge = canvas.clientWidth * dpr > 1400 && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096
    const image = new Image()
    image.decoding = 'async'
    image.src = wantLarge ? textures.large : textures.small
    await image.decode()
    if (disposed) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  })()

  return {
    ready,
    draw(centerLon, size, visibleFraction) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const px = Math.round(size * dpr)
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      gl.viewport(0, 0, px, px)
      const visible = Math.ceil(px * Math.min(Math.max(visibleFraction, 0), 1))
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(0, px - visible, px, visible)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uLon0, (centerLon * Math.PI) / 180)
      gl.uniform1f(uPixel, 1.5 / px)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      disposed = true
      gl.deleteTexture(texture)
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
