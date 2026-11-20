/**
 * Every picture in the app is drawn with WebGL2.
 *
 * Browsers keep only about 16 WebGL contexts alive per page and silently drop
 * the oldest past that, and the Gyms page alone shows 32 pictures. So there is
 * one hidden WebGL context for the whole app: it draws each picture, then hands
 * the finished image to that picture's <canvas>, which only displays it.
 *
 * The art is all flat rectangles, so drawing is one instanced draw call per
 * blend mode: each rectangle is four numbers for where and four for colour.
 */

export type Blend = "source-over" | "multiply";

type Rgba = readonly [number, number, number, number];

const colours = new Map<string, Rgba>();

/** Turns "#rgb", "#rrggbb", "rgb(...)" or "rgba(...)" into 0..1 channels. */
export function parseColour(css: string): Rgba {
  const known = colours.get(css);
  if (known) return known;
  let rgba: Rgba | null = null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const channel = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    rgba = [channel(0), channel(2), channel(4), 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css);
  if (fn) rgba = [+fn[1] / 255, +fn[2] / 255, +fn[3] / 255, fn[4] === undefined ? 1 : +fn[4]];
  if (!rgba || rgba.some((v) => !(v >= 0 && v <= 1))) throw new Error(`Unsupported colour: ${css}`);
  colours.set(css, rgba);
  return rgba;
}

/**
 * What the art draws onto. It has the same names as the few parts of the 2D
 * canvas API the art needs, but only records rectangles; WebGL draws them.
 */
export class Painter {
  fillStyle = "#000000";
  globalCompositeOperation: Blend = "source-over";
  /** Runs of rectangles that share a blend mode, in drawing order. */
  readonly runs: { blend: Blend; rects: number[] }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = parseColour(this.fillStyle);
    let run = this.runs.at(-1);
    if (run?.blend !== this.globalCompositeOperation) {
      run = { blend: this.globalCompositeOperation, rects: [] };
      this.runs.push(run);
    }
    // Colours go to the GPU with alpha already multiplied in, which is what the blending below expects.
    run.rects.push(x, y, w, h, r * a, g * a, b * a, a);
  }
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 corner; // 0..1 across a unit square
layout(location = 1) in vec4 rect;   // x, y, width, height in art pixels
layout(location = 2) in vec4 colour; // alpha already multiplied in
uniform vec2 size;                   // picture size in art pixels
out vec4 vColour;
void main() {
  vec2 p = (rect.xy + corner * rect.zw) / size;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0); // y runs down, like the 2D canvas
  vColour = colour;
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec4 vColour;
out vec4 outColour;
void main() {
  outColour = vColour;
}`;

const FLOATS_PER_RECT = 8;

class Renderer {
  readonly canvas = new OffscreenCanvas(1, 1);
  readonly gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private rects!: WebGLBuffer;
  private size!: WebGLUniformLocation;
  /** Pictures asked for while the GPU was unavailable, drawn once it is back. */
  readonly waiting = new Set<() => void>();

  constructor() {
    // Without preventDefault the browser never gives a lost context back.
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.setup();
      for (const redraw of [...this.waiting]) redraw();
    });
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false, // hard pixel edges
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("This browser does not support WebGL2, which the pictures need.");
    this.gl = gl;
    this.setup();
  }

  /** Builds everything on the GPU. Runs again if the context is lost and restored. */
  private setup() {
    const gl = this.gl;
    const compile = (type: GLenum, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL could not create a shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader did not compile: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shaders did not link: ${gl.getProgramInfoLog(program)}`);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const size = gl.getUniformLocation(program, "size");
    if (!size) throw new Error("Shader is missing its size input");

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const rects = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rects);
    const stride = FLOATS_PER_RECT * 4;
    for (const [location, offset] of [[1, 0], [2, 16]]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, 1); // one value per rectangle, not per corner
    }
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    this.program = program;
    this.vao = vao;
    this.rects = rects;
    this.size = size;
  }

  /** Draws one picture. Returns null while the GPU context is lost. */
  render(painter: Painter): ImageBitmap | null {
    const gl = this.gl;
    if (gl.isContextLost()) return null;
    this.canvas.width = painter.width;
    this.canvas.height = painter.height;
    gl.viewport(0, 0, painter.width, painter.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.size, painter.width, painter.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rects);
    for (const run of painter.runs) {
      if (run.blend === "multiply") {
        // Matches the 2D canvas "multiply" wherever the picture underneath is already opaque.
        gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(run.rects), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.rects.length / FLOATS_PER_RECT);
    }
    gl.bindVertexArray(null);
    return this.canvas.transferToImageBitmap();
  }
}

let shared: Renderer | null = null;
let unsupported = false;

/**
 * Draws a picture with WebGL and shows it in `target`. Returns a function that
 * cancels a redraw still waiting for a lost GPU context to come back.
 * Without WebGL2 the pictures stay blank (logged once) rather than crash the page.
 */
export function paint(target: HTMLCanvasElement, width: number, height: number, draw: (painter: Painter) => void): () => void {
  if (unsupported) return () => {};
  try {
    shared ??= new Renderer();
  } catch (error) {
    unsupported = true;
    console.error(error);
    return () => {};
  }
  const renderer = shared;
  const run = () => {
    const painter = new Painter(width, height);
    draw(painter);
    const image = renderer.render(painter);
    if (!image) {
      renderer.waiting.add(run);
      return;
    }
    renderer.waiting.delete(run);
    const out = target.getContext("bitmaprenderer");
    if (!out) throw new Error("This browser cannot show WebGL pictures in a canvas");
    out.transferFromImageBitmap(image);
  };
  run();
  return () => renderer.waiting.delete(run);
}
