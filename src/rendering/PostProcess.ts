/**
 * WebGL2 post-processing: additive bloom overlay.
 * A second canvas sits on top of the main Canvas 2D with mix-blend-mode: screen.
 * Each frame the main canvas is read as a WebGL texture, bright areas are
 * extracted and blurred (2× separable Gaussian at ¼ resolution), and the
 * result is drawn back to the overlay with screen blending so lit windows,
 * headlights and lamp posts bleed light into their surroundings at night.
 * Falls back silently if WebGL2 is unavailable.
 */
export class PostProcess {
  private _supported = false;
  private gl: WebGL2RenderingContext | null = null;
  private overlayCanvas: HTMLCanvasElement;

  // Shaders / programs
  private progExtract: WebGLProgram | null = null;
  private progBlur: WebGLProgram | null = null;
  private progComposite: WebGLProgram | null = null;

  // VAO
  private vao: WebGLVertexArrayObject | null = null;

  // Textures & FBOs
  private texScene: WebGLTexture | null = null;
  private fboBright: WebGLFramebuffer | null = null;
  private texBright: WebGLTexture | null = null;
  private fboBlurA: WebGLFramebuffer | null = null;
  private texBlurA: WebGLTexture | null = null;
  private fboBlurB: WebGLFramebuffer | null = null;
  private texBlurB: WebGLTexture | null = null;

  // Half-res dimensions
  private halfW = 0;
  private halfH = 0;
  private fullW = 0;
  private fullH = 0;

  // Uniform locations — extract
  private uThreshold: WebGLUniformLocation | null = null;
  private uSceneExtract: WebGLUniformLocation | null = null;

  // Uniform locations — blur
  private uTexBlur: WebGLUniformLocation | null = null;
  private uDir: WebGLUniformLocation | null = null;

  // Uniform locations — composite
  private uBloom: WebGLUniformLocation | null = null;
  private uStrength: WebGLUniformLocation | null = null;

  constructor(mainCanvas: HTMLCanvasElement) {
    // Keep the WebGL canvas purely offscreen — never added to the DOM.
    // CSS mix-blend-mode forces the browser compositor to blend two GPU layers
    // every frame, which is expensive. Instead, main.ts reads the bloom output
    // via getCanvas() and composites it onto the main canvas with a JS
    // ctx.drawImage(...) call using globalCompositeOperation='screen', which
    // lets the GPU handle the copy without CSS compositor overhead.
    const oc = document.createElement('canvas');
    this.overlayCanvas = oc;

    try {
      this.initGL(mainCanvas);
    } catch (e) {
      console.warn('[PostProcess] WebGL2 init failed, bloom disabled.', e);
      this._supported = false;
    }
  }

  // ── GL init ────────────────────────────────────────────────────────────────

  private initGL(_src: HTMLCanvasElement) {
    // WebGL2 context MUST come from the overlay canvas, not the main canvas.
    // A canvas can only hold one rendering context — the main canvas already
    // has a 2D context, so requesting webgl2 from it returns null silently.
    const gl = this.overlayCanvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGL2RenderingContext | null;

    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // ── Vertex shader (shared) ──────────────────────────────────────────────
    // layout(location=0) pins the attribute to slot 0 across all programs so
    // the single VAO works correctly regardless of link order.
    const vsSource = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

    // ── Bright-extract fragment ─────────────────────────────────────────────
    const fsExtract = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float ramp = smoothstep(uThreshold - 0.1, uThreshold + 0.15, lum);
  outColor = vec4(c * ramp, 1.0);
}`;

    // ── 9-tap separable Gaussian blur fragment ──────────────────────────────
    const fsBlur = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  const float w[5] = float[5](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  vec4 result = texture(uTex, vUV) * w[0];
  for (int i = 1; i <= 4; i++) {
    vec2 off = uDir * float(i);
    result += texture(uTex, vUV + off) * w[i];
    result += texture(uTex, vUV - off) * w[i];
  }
  outColor = result;
}`;

    // ── Composite fragment ──────────────────────────────────────────────────
    const fsComposite = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uBloom;
uniform float uStrength;
void main() {
  vec3 bloom = texture(uBloom, vUV).rgb;
  outColor = vec4(bloom * uStrength, 1.0);
}`;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fse = this.compileShader(gl.FRAGMENT_SHADER, fsExtract);
    const fsb = this.compileShader(gl.FRAGMENT_SHADER, fsBlur);
    const fsc = this.compileShader(gl.FRAGMENT_SHADER, fsComposite);

    this.progExtract = this.linkProgram(vs, fse);
    this.progBlur = this.linkProgram(vs, fsb);
    this.progComposite = this.linkProgram(vs, fsc);

    // Cache uniform locations
    this.uThreshold = gl.getUniformLocation(this.progExtract, 'uThreshold');
    this.uSceneExtract = gl.getUniformLocation(this.progExtract, 'uScene');
    this.uTexBlur = gl.getUniformLocation(this.progBlur, 'uTex');
    this.uDir = gl.getUniformLocation(this.progBlur, 'uDir');
    this.uBloom = gl.getUniformLocation(this.progComposite, 'uBloom');
    this.uStrength = gl.getUniformLocation(this.progComposite, 'uStrength');

    // ── Full-screen quad VAO ────────────────────────────────────────────────
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    // Attribute is pinned to location 0 via layout qualifier — use it directly.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ── Scene texture (updated every frame from srcCanvas) ──────────────────
    this.texScene = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._supported = true;

    // Initial size
    this.resize(_src.width, _src.height);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  }

  private linkProgram(vs: WebGLShader, fs: WebGLShader): WebGLProgram {
    const gl = this.gl!;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  private makeFBOTex(w: number, h: number): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fbo, tex };
  }

  private deleteFBO(fbo: WebGLFramebuffer | null, tex: WebGLTexture | null) {
    if (!this.gl) return;
    if (fbo) this.gl.deleteFramebuffer(fbo);
    if (tex) this.gl.deleteTexture(tex);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get supported(): boolean { return this._supported; }

  /** The offscreen WebGL canvas holding the latest bloom frame. */
  getCanvas(): HTMLCanvasElement { return this.overlayCanvas; }

  resize(w: number, h: number) {
    if (!this._supported || !this.gl) return;

    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
    this.fullW = w;
    this.fullH = h;

    const hw = Math.max(1, w >> 2);
    const hh = Math.max(1, h >> 2);
    this.halfW = hw;
    this.halfH = hh;

    // Delete old FBOs
    this.deleteFBO(this.fboBright, this.texBright);
    this.deleteFBO(this.fboBlurA, this.texBlurA);
    this.deleteFBO(this.fboBlurB, this.texBlurB);

    const bright = this.makeFBOTex(hw, hh);
    this.fboBright = bright.fbo;
    this.texBright = bright.tex;

    const blurA = this.makeFBOTex(hw, hh);
    this.fboBlurA = blurA.fbo;
    this.texBlurA = blurA.tex;

    const blurB = this.makeFBOTex(hw, hh);
    this.fboBlurB = blurB.fbo;
    this.texBlurB = blurB.tex;
  }

  render(srcCanvas: HTMLCanvasElement, nightAlpha: number) {
    if (!this._supported || !this.gl) return;

    // 1. Handle canvas resize
    if (srcCanvas.width !== this.fullW || srcCanvas.height !== this.fullH) {
      this.resize(srcCanvas.width, srcCanvas.height);
    }

    // 2. Compute bloom strength and threshold.
    const t = nightAlpha / 0.6; // 0 = noon, 1 = full night

    // Skip the entire pipeline during full daylight — threshold of 0.92 means
    // almost nothing passes the bright-extract stage anyway, so running 5 shader
    // passes would burn GPU time for invisible output. Kicks in at dusk (~5pm).
    if (t < 0.08) {
      // Clear the overlay so any stale bloom from last night doesn't linger.
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const bloomStrength = 0.18 + Math.pow(t, 1.1) * 1.2;
    // High threshold at dusk (only the very brightest pixels bloom);
    // lower at full night so lit windows and lamp halos are included.
    const threshold = Math.max(0.55, 0.92 - t * 0.42);

    const gl = this.gl;
    const hw = this.halfW;
    const hh = this.halfH;

    gl.bindVertexArray(this.vao);

    // 3. Upload srcCanvas → texScene
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // ── Pass 1: bright extract → fboBright ──────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBright);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(this.progExtract);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.uniform1i(this.uSceneExtract, 0);
    gl.uniform1f(this.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Helper to run a blur pass
    const blurPass = (
      fromTex: WebGLTexture | null,
      toFbo: WebGLFramebuffer | null,
      dx: number,
      dy: number
    ) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, toFbo);
      gl.viewport(0, 0, hw, hh);
      gl.useProgram(this.progBlur);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fromTex);
      gl.uniform1i(this.uTexBlur, 0);
      gl.uniform2f(this.uDir, dx, dy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // ── Passes 2-5: 2× separable Gaussian blur ──────────────────────────────
    // Pass 2: blur H
    blurPass(this.texBright, this.fboBlurA, 1.0 / hw, 0);
    // Pass 3: blur V
    blurPass(this.texBlurA, this.fboBlurB, 0, 1.0 / hh);
    // Pass 4: blur H wider
    blurPass(this.texBlurB, this.fboBlurA, 1.5 / hw, 0);
    // Pass 5: blur V wider
    blurPass(this.texBlurA, this.fboBlurB, 0, 1.5 / hh);

    // ── Pass 6: composite → overlay canvas ──────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texBlurB);
    gl.uniform1i(this.uBloom, 0);
    gl.uniform1f(this.uStrength, bloomStrength);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
  }

  destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    this.deleteFBO(this.fboBright, this.texBright);
    this.deleteFBO(this.fboBlurA, this.texBlurA);
    this.deleteFBO(this.fboBlurB, this.texBlurB);
    if (this.texScene) gl.deleteTexture(this.texScene);
    if (this.progExtract) gl.deleteProgram(this.progExtract);
    if (this.progBlur) gl.deleteProgram(this.progBlur);
    if (this.progComposite) gl.deleteProgram(this.progComposite);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.overlayCanvas.parentNode) {
      this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
    }
    this._supported = false;
    this.gl = null;
  }
}
