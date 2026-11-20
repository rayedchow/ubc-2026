/** The atlas uses an orthographic mesh pass at native art resolution, then a pixel-sharp camera pass. */
type GL = WebGLRenderingContext;
import { floatsPerVertex, shadowStep, type Landscape } from "./landscape";

const sunProjection = `
attribute vec3 vertex;
attribute float elevation;
uniform vec2 sunStep;
varying highp vec3 sunlight;
void projectSun() {
  sunlight = vec3(vertex.xy + sunStep * elevation, elevation / 255.);
}`;
const casterVertex = `${sunProjection}
void main() {
  projectSun();
  gl_Position = vec4(sunlight.xy * 2. - 1., 1. - sunlight.z * 2., 1.);
}`;
const casterFragment = `
precision highp float;
varying highp vec3 sunlight;
void main() { gl_FragColor = vec4(sunlight.z, 0., 0., 1.); }`;
const meshVertex = `${sunProjection}
attribute vec4 material;
varying vec4 paint;
void main() {
  projectSun();
  gl_Position = vec4(vertex.x*2.0-1.0,1.0-vertex.y*2.0,vertex.z*2.0-1.0,1.0);
  paint = vec4(material.rgb,material.a/255.0);
}`;
const meshFragment = `
precision highp float;
varying vec4 paint;
varying highp vec3 sunlight;
uniform sampler2D casters;
uniform float stride;
void main() {
  vec4 pixel = paint;
  vec4 roof = texture2D(casters, sunlight.xy);
  if (roof.a > .5 && roof.r > sunlight.z + .003 && paint.a * 255. < stride - .5) {
    if (paint.a < .001) pixel.g = 1.;
    else pixel.rgb = pixel.rgb * vec3(.59, .61, .69) + vec3(.027, .021, .026);
  }
  gl_FragColor = pixel;
}`;
const screenVertex = `
attribute vec2 vertex;
uniform vec2 scale;
uniform vec2 origin;
varying vec2 uv;
void main() {
  gl_Position=vec4(vertex,0.0,1.0);
  uv = ((vertex * vec2(0.5,-0.5) + 0.5) - origin) / scale;
}`;
const ocean = `
float hash(vec2 p) {
  vec3 h=fract(vec3(p.xyx)*.1031);
  h+=dot(h,h.yzx+33.33);
  return fract((h.x+h.y)*h.z);
}
vec3 oceanColor(vec2 p, float depth, float light) {
  vec3 deep=mix(vec3(.42,.53,.56),vec3(.70,.82,.82),light);
  vec3 bay=mix(vec3(.34,.65,.65),vec3(.55,.81,.77),light);
    vec3 col=mix(deep,bay,smoothstep(.08,.82,depth));
    col=mix(col,vec3(.42,.79,.74),smoothstep(.72,1.,depth)*.85);
    col+=vec3(.010,.016,.015)*smoothstep(.62,.92,depth)*sin(depth*75.+p.y*.06);
    col*=.975+.045*sin(p.y*.014+sin(p.x*.009));
    vec2 cell=floor(p/vec2(15.,8.));
    vec2 part=mod(p,vec2(15.,8.));
    float h=hash(cell);
    if(h>.78 && abs(part.y-floor(h*6.))<.2 && abs(part.x-7.)<2.+h) col+=vec3(.045,.063,.061);
    if(depth>.982 && hash(floor(p/vec2(5.,2.)))>.25) col=mix(col,vec3(.88,.94,.78),.59);
    return col;
}`;
const screenFragment = `
precision highp float;
uniform sampler2D terrain;
uniform vec2 texel;
uniform float stride;
uniform float selected;
uniform float marked;
uniform float building;
uniform float hovering;
uniform vec2 stroke;
uniform float light;
varying vec2 uv;
${ocean}
float objectAt(vec2 uv) {
  if(min(uv.x,uv.y)<0. || max(uv.x,uv.y)>=1.) return 0.;
  return floor(texture2D(terrain,uv).a*255.+.5);
}
void main() {
  vec2 at=vec2(uv.x,1.0-uv.y);
  bool inside=min(uv.x,uv.y)>=0.0 && max(uv.x,uv.y)<1.0;
  vec4 pixel=inside ? texture2D(terrain,at) : vec4(0);
  float objectId=floor(pixel.a*255.0+.5);
  float id=mod(objectId,stride);
  vec2 p=floor(uv/texel);
  if(id<.5) {
    vec3 col=oceanColor(p,pixel.r,light);
    col *= 1. - .28 * pixel.g;
    if(building>=stride) col=mix(col,vec3(dot(col,vec3(.299,.587,.114))),.84);
    gl_FragColor=vec4(col,1.); return;
  }
  vec3 color=pixel.rgb;

  bool isHall=objectId>=stride;
  bool activeHall=isHall && (objectId==building || objectId==hovering);
  vec2 thickness=stroke*(activeHall?1.65:isHall?1.:1.35);
  bool edge=false; bool seam=false;
  for(int k=0;k<4;k++){
    vec2 axis=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
    float near=objectAt(at+axis*thickness);
    edge=edge || near!=objectId;
    seam=seam || mod(near,stride)!=id;
  }
  if(isHall && edge) color=activeHall?vec3(1.,.83,.33):mix(color,vec3(.16,.12,.17),.83);
  else if(seam) color=id==marked?vec3(1.,.87,.49):mix(color,vec3(.33,.28,.31),.74);
  bool inactive=building>=stride?objectId!=building:(selected>.5 && id!=selected);
  if(inactive) {
    float grey=dot(color,vec3(.299,.587,.114))*.78+.06;
    color=vec3(grey*.99,grey,grey*.97);
  }
  gl_FragColor=vec4(color,1.);
}`;

function program(gl: GL, vertex: string, fragment: string) {
  const p = gl.createProgram()!;
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      if (compiled) gl.attachShader(p, shader);
      const message = compiled ? "" : gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      if (!compiled) throw new Error(message || "Shader compilation failed");
    }
    gl.bindAttribLocation(p, 0, "vertex");
    gl.bindAttribLocation(p, 1, "material");
    gl.bindAttribLocation(p, 2, "elevation");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) || "Shader link failed");
    return p;
  } catch (error) {
    gl.deleteProgram(p);
    throw error;
  }
}

/** Render the same open water as the atlas without allocating any terrain or picking buffers. */
export function createOpenWaterRenderer(gl: GL) {
  const water = program(
    gl,
    `attribute vec2 vertex;
    void main() { gl_Position=vec4(vertex,0.,1.); }`,
    `precision highp float; ${ocean}
    void main() { gl_FragColor=vec4(oceanColor(floor(gl_FragCoord.xy),0.,0.),1.); }`,
  );
  const quad = gl.createBuffer()!;
  gl.useProgram(water);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return {
    draw() {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(quad);
      gl.deleteProgram(water);
    },
  };
}

export function createRealmRenderer(gl: GL, map: Landscape) {
  const { width, height } = map;
  const density = Math.min(1.7, gl.getParameter(gl.MAX_TEXTURE_SIZE) / Math.max(width, height));
  const pixelsX = Math.floor(width * density),
    pixelsY = Math.floor(height * density);
  const resources: (() => void)[] = [];
  const dispose = () => {
    for (const remove of resources.splice(0).reverse()) remove();
  };
  function texture() {
    const t = gl.createTexture()!;
    resources.push(() => gl.deleteTexture(t));
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function buffer(data: ArrayBuffer | Float32Array<ArrayBuffer>) {
    const b = gl.createBuffer()!;
    resources.push(() => gl.deleteBuffer(b));
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  try {
    const caster = program(gl, casterVertex, casterFragment);
    resources.push(() => gl.deleteProgram(caster));
    const face = program(gl, meshVertex, meshFragment);
    resources.push(() => gl.deleteProgram(face));
    const camera = program(gl, screenVertex, screenFragment);
    resources.push(() => gl.deleteProgram(camera));
    const shadow = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixelsX, pixelsY, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const terrain = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixelsX, pixelsY, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    resources.push(() => gl.deleteFramebuffer(fbo));
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadow, 0);
    const depth = gl.createRenderbuffer()!;
    resources.push(() => gl.deleteRenderbuffer(depth));
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, pixelsX, pixelsY);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("Map framebuffer unavailable");
    gl.viewport(0, 0, pixelsX, pixelsY);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    buffer(map.vertices);
    const bytes = floatsPerVertex * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, bytes, 28);
    // Only building triangles cast. Bake once, including shadows falling onto lower terraces.
    gl.useProgram(caster);
    gl.uniform2f(gl.getUniformLocation(caster, "sunStep"), shadowStep[0], shadowStep[1]);
    gl.drawArrays(gl.TRIANGLES, map.buildings.first, map.buildings.count);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, terrain, 0);
    gl.bindTexture(gl.TEXTURE_2D, shadow);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(face);
    gl.uniform2f(gl.getUniformLocation(face, "sunStep"), shadowStep[0], shadowStep[1]);
    gl.uniform1f(gl.getUniformLocation(face, "stride"), map.stride);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, bytes, 12);
    gl.drawArrays(gl.TRIANGLES, 0, map.vertices.length / floatsPerVertex);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    // Cache ownership once per seed. Pointer events never stall the GPU.
    const rgba = new Uint8Array(pixelsX * pixelsY * 4);
    gl.readPixels(0, 0, pixelsX, pixelsY, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const owners = new Uint8Array(pixelsX * pixelsY);
    for (let i = 0; i < owners.length; i++) owners[i] = rgba[i * 4 + 3];
    // Label the centre of the *visible* territory. A roof or channel may hide its geometric centroid.
    const anchors = new Map<number, number[]>();
    const [bx, by, bw, bh] = map.bounds;
    const idAt = (x: number, y: number) => owners[(pixelsY - 1 - y) * pixelsX + x];
    for (let id = 1; id <= Object.keys(map.regions).length; id++) {
      const ground: number[][] = [];
      let sx = 0,
        sy = 0,
        count = 0;
      for (
        let y = Math.max(0, Math.floor((by * pixelsY) / height));
        y < Math.min(pixelsY, ((by + bh) * pixelsY) / height);
        y += 4
      ) {
        for (
          let x = Math.max(0, Math.floor((bx * pixelsX) / width));
          x < Math.min(pixelsX, ((bx + bw) * pixelsX) / width);
          x += 4
        ) {
          const owner = idAt(x, y);
          if (owner % map.stride !== id) continue;
          sx += x;
          sy += y;
          count++;
          if (owner === id) ground.push([x, y]);
        }
      }
      if (ground.length) {
        const score = ([x, y]: number[]) =>
          Math.hypot(x - sx / count, y - sy / count) +
          [
            [-12, 0],
            [12, 0],
            [0, -5],
            [0, 5],
          ].reduce((n, [dx, dy]) => n + (idAt(x + dx, y + dy) !== id ? 24 : 0), 0);
        const best = ground.reduce((a, b) => (score(a) < score(b) ? a : b));
        anchors.set(id, [(best[0] * width) / pixelsX, (best[1] * height) / pixelsY]);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(camera);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name: string) => gl.getUniformLocation(camera, name);
    const scale = uniform("scale"),
      origin = uniform("origin"),
      selected = uniform("selected"),
      marked = uniform("marked"),
      tone = uniform("light"),
      stroke = uniform("stroke"),
      hall = uniform("building"),
      over = uniform("hovering");
    gl.uniform1f(uniform("stride"), map.stride);
    gl.uniform2f(uniform("texel"), 1 / pixelsX, 1 / pixelsY);
    let left = 0,
      top = 0,
      zoom = 1;
    return {
      draw(
        w: number,
        h: number,
        box: number[],
        active: number,
        hover: number,
        light: boolean,
        building: number,
        hovering: number,
      ) {
        zoom = Math.min(w / box[2], h / box[3]);
        left = (w - box[2] * zoom) / 2 - box[0] * zoom;
        top = (h - box[3] * zoom) / 2 - box[1] * zoom;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform2f(scale, (width * zoom) / w, (height * zoom) / h);
        gl.uniform2f(origin, left / w, top / h);
        gl.uniform1f(selected, active);
        gl.uniform1f(marked, hover || active);
        gl.uniform1f(tone, light ? 1 : 0);
        gl.uniform2f(
          stroke,
          Math.max(2.3 / (width * zoom), 1 / pixelsX),
          Math.max(2.3 / (height * zoom), 1 / pixelsY),
        );
        gl.uniform1f(hall, building);
        gl.uniform1f(over, hovering);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      regionAnchor: (id: number) => anchors.get(id),
      project(x: number, y: number) {
        return [left + x * zoom, top + y * zoom];
      },
      pick(x: number, y: number) {
        const col = Math.floor(((x - left) * pixelsX) / (zoom * width)),
          row = Math.floor(((y - top) * pixelsY) / (zoom * height));
        return col >= 0 && row >= 0 && col < pixelsX && row < pixelsY
          ? owners[(pixelsY - 1 - row) * pixelsX + col]
          : 0;
      },
      dispose,
    };
  } catch (error) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    dispose();
    throw error;
  }
}
