/* Hero lattice — the /100 piece, reduced to a background.

   The original is a full-screen instrument: a techno engine drives the pulse,
   a control panel sets the node count, the camera cuts on the bar, and the
   whole thing is white ink accumulated on black. None of that belongs behind a
   headline, so what is kept here is only the part that is the picture:

     · the topology builder — a graph that grows node by node, budding off its
       parent, closing triangles, and every so often opening a rosette
     · the GPU force simulation — springs, density-contrast pressure, a per-node
       wander, gravity and a soft wall
     · the auto-framing camera, which follows the mass and holds it in frame

   Four deliberate departures from the original:

     Colour. The simulation still accumulates white ink on black, because that
     is what an additive buffer is good at. The inversion happens once, in the
     composite: ink becomes the amount of blue laid on white. Nothing upstream
     had to learn about the palette.

     Sound. There is none, so the levels the frame asks for come from three slow
     sines instead of an analyser. No beats, so no rings; no bars, so the camera
     never cuts. It only drifts.

     Speed. One time-scale on the frame's dt slows every part of the piece by
     the same factor, rather than each constant being retuned by hand.

     Count. 100 nodes, where the original runs thousands. Low enough that each
     node and edge is a legible mark rather than a texture — which is the point
     at this size, behind type.

   It mounts into a container rather than the viewport, and tears down fully:
   the carousel builds and destroys it every time the stop is passed through.
*/
(function () {
  'use strict';

  var N = 100;                 /* nodes — few enough that each one reads */
  var SPEED = 0.42;            /* one time-scale over the whole piece */
  /* Read from the page rather than fixed here, so the piece takes whatever the
     palette says the brand colour is — the same source kg-flow.js reads. The
     shader wants floats, so the token is parsed once at mount. */
  function ink() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--eu-blue').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return [0x00 / 255, 0x33 / 255, 0x99 / 255];
    var n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  var ALPHA = 0.25;            /* how much of that blue actually lands */

  var TW = 1024, ETW = 1024, FIELD = 768;
  var REVEAL = 34, SETTLE = 9, COLLAPSE = 3.6;

  var CFG = { grav: .34, repel: .55, spring: 4.6, fade: .30, gain: 1.35,
              nodeA: .52, nodeS: 1.7, edgeA: .30, rest: 1, wander: .05,
              bloom: 18, mesh: .18, petal: 1.15 };

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  window.heroLattice = { mount: mount, unmount: unmount };

  var live = null;

  function unmount() {
    if (!live) return;
    live.stop();
    live = null;
  }

  function mount(host) {
    unmount();
    var inst = build(host);
    if (!inst) return false;
    live = inst;
    return true;
  }

  /* ------------------------------------------------------------------ */

  function build(host) {
    var cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(cvs);

    var gl = cvs.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance'
    });
    /* No WebGL2, or no float buffers, means no piece. The caller falls back to
       the blank hero rather than showing half of one. */
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
      host.removeChild(cvs);
      return null;
    }
    gl.getExtension('OES_texture_float_linear');

    var INK = ink();
    var isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------- shader plumbing ---------------- */
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      p.u = {};
      p.at = function (k) {
        if (!(k in p.u)) p.u[k] = gl.getUniformLocation(p, k);
        return p.u[k];
      };
      return p;
    }
    function tex(w, h, internal, format, type, data, filter) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
      var f = filter || gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fbo(t) {
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return f;
    }
    function bindTex(units) {
      for (var i = 0; i < units.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, units[i]);
      }
    }
    var dummyVAO = gl.createVertexArray();
    gl.bindVertexArray(dummyVAO);

    var QUAD_VS = '#version 300 es\n' +
      'precision highp float;\n' +
      'const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));\n' +
      'out vec2 vUv;\n' +
      'void main(){ vec2 p = P[gl_VertexID]; vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }';

    var FETCH =
      'ivec2 tc(float i, float w){ return ivec2(int(mod(i,w)), int(floor(i/w))); }\n' +
      'ivec2 tci(int i, int w){ return ivec2(i%w, i/w); }';

    var CAM =
      'uniform vec2 uProj, uPan; uniform float uRot;\n' +
      'vec2 project(vec2 p){\n' +
      '  float c = cos(uRot), s = sin(uRot);\n' +
      '  return (vec2(p.x*c - p.y*s, p.x*s + p.y*c) + uPan) * uProj;\n' +
      '}';

    /* ---------------- programs ---------------- */

    /* force integration — springs, density-contrast pressure, wander, gravity */
    var pPhys = prog(QUAD_VS, '#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uPos, uAttr, uNbrA, uNbrB, uRstA, uRstB, uField, uCoarse;\n' +
      'uniform vec2 uTS;\n' +
      'uniform float uTime, uDt, uBass, uCollapse, uGrav, uRepel, uSpring, uRest, uStep, uWander;\n' +
      'uniform vec3 uRings[4];\n' +
      'out vec4 outColor;\n' + FETCH + '\n' +
      'void main(){\n' +
      '  ivec2 ij = ivec2(gl_FragCoord.xy);\n' +
      '  vec4 P = texelFetch(uPos, ij, 0);\n' +
      '  vec4 A = texelFetch(uAttr, ij, 0);\n' +
      '  vec2 p = P.xy, v = P.zw;\n' +
      '  float birth = A.x, degN = A.y, phase = A.z, par = A.w;\n' +
      /* unborn nodes ride their parent, then bud off */
      '  if (uTime < birth){\n' +
      '    vec2 tp = texelFetch(uPos, tc(par, uTS.x), 0).xy + vec2(cos(phase), sin(phase)) * 0.005;\n' +
      '    outColor = vec4(mix(p, tp, 0.4), 0., 0.);\n' +
      '    return;\n' +
      '  }\n' +
      '  vec2 f = vec2(0.);\n' +
      '  vec4 nA = texelFetch(uNbrA, ij, 0);\n' +
      '  vec4 nB = texelFetch(uNbrB, ij, 0);\n' +
      '  vec4 rA = texelFetch(uRstA, ij, 0);\n' +
      '  vec4 rB = texelFetch(uRstB, ij, 0);\n' +
      '  float ids[8] = float[8](nA.x,nA.y,nA.z,nA.w,nB.x,nB.y,nB.z,nB.w);\n' +
      '  float rst[8] = float[8](rA.x,rA.y,rA.z,rA.w,rB.x,rB.y,rB.z,rB.w);\n' +
      '  float open = uRest * (1. + .55 * degN);\n' +   /* hubs hold their spokes further out */
      '  for (int k = 0; k < 8; k++){\n' +
      '    float id = ids[k];\n' +
      '    if (id < 0.) continue;\n' +
      '    ivec2 q = tc(id, uTS.x);\n' +
      '    vec2 d = texelFetch(uPos, q, 0).xy - p;\n' +
      '    float lv = step(texelFetch(uAttr, q, 0).x, uTime);\n' +
      '    float L = max(length(d), 1e-5);\n' +
      '    f += (d / L) * (L - rst[k] * open) * uSpring * lv;\n' +
      '  }\n' +
      /* pressure from density CONTRAST: crowding pushes apart, uniform fields don't inflate */
      '  vec2 uv = p * .5 + .5;\n' +
      '  vec2 e = vec2(uStep, 0.);\n' +
      '  float gx = (texture(uField, uv + e.xy).r - texture(uField, uv - e.xy).r)\n' +
      '           - (texture(uCoarse, uv + e.xy).r - texture(uCoarse, uv - e.xy).r);\n' +
      '  float gy = (texture(uField, uv + e.yx).r - texture(uField, uv - e.yx).r)\n' +
      '           - (texture(uCoarse, uv + e.yx).r - texture(uCoarse, uv - e.yx).r);\n' +
      '  f -= vec2(gx, gy) * uRepel * (1. - .75 * degN);\n' +
      /* a slow drift per node — leaves wander, hubs hold. keeps the graph liquid. */
      '  float w = phase * 3.1 + uTime * (.3 + fract(phase) * .5);\n' +
      '  f += vec2(cos(w), sin(w)) * uWander * (1. - degN);\n' +
      '  float r = max(length(p), 1e-5);\n' +
      '  vec2 rad = p / r;\n' +
      '  f -= p * uGrav * (1. + uBass * .55);\n' +
      '  f += vec2(-p.y, p.x) * 0.30 * (1. - min(r, 1.));\n' +
      '  if (r > .94) f -= rad * (r - .94) * 55.;\n' +
      '  for (int k = 0; k < 4; k++){\n' +
      '    if (uRings[k].y <= 0.) continue;\n' +
      '    f += rad * uRings[k].y * exp(-pow((r - uRings[k].x) / uRings[k].z, 2.));\n' +
      '  }\n' +
      '  f += rad * uCollapse;\n' +
      '  v += f * uDt;\n' +
      '  v *= exp(-2.7 * uDt);\n' +
      '  float sp = length(v);\n' +
      '  if (sp > 2.6) v *= 2.6 / sp;\n' +
      '  p += v * uDt;\n' +
      '  outColor = vec4(p, v);\n' +
      '}');

    /* density field accumulation (points splatted in world space) */
    var pField = prog('#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uPos, uAttr;\n' +
      'uniform vec2 uTS;\n' +
      'uniform float uTime, uSize;\n' +
      'out float vOn;\n' + FETCH + '\n' +
      'void main(){\n' +
      '  ivec2 ij = tci(gl_VertexID, int(uTS.x));\n' +
      '  vec4 A = texelFetch(uAttr, ij, 0);\n' +
      '  vOn = step(A.x, uTime);\n' +
      '  gl_Position = vec4(texelFetch(uPos, ij, 0).xy, 0., 1.);\n' +
      '  gl_PointSize = uSize;\n' +
      '}', '#version 300 es\n' +
      'precision highp float;\n' +
      'in float vOn;\n' +
      'out vec4 outColor;\n' +
      'void main(){\n' +
      '  float d = length(gl_PointCoord - .5) * 2.;\n' +
      '  outColor = vec4(exp(-d*d*2.2) * .055 * vOn, 0., 0., 1.);\n' +
      '}');

    /* separable blur for the field */
    var pBlur = prog(QUAD_VS, '#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uSrc; uniform vec2 uDir;\n' +
      'in vec2 vUv; out vec4 outColor;\n' +
      'void main(){\n' +
      '  float s = texture(uSrc, vUv).r * .227;\n' +
      '  s += (texture(uSrc, vUv + uDir*1.385).r + texture(uSrc, vUv - uDir*1.385).r) * .316;\n' +
      '  s += (texture(uSrc, vUv + uDir*3.253).r + texture(uSrc, vUv - uDir*3.253).r) * .070;\n' +
      '  outColor = vec4(s, 0., 0., 1.);\n' +
      '}');

    var pNode = prog('#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uPos, uAttr;\n' +
      'uniform vec2 uTS;\n' +
      'uniform float uTime, uPx, uBass, uFade, uHigh, uAlphaK, uSizeK;\n' +
      'uniform vec3 uRings[4];\n' +
      'out float vA, vFl;\n' + FETCH + '\n' + CAM + '\n' +
      'void main(){\n' +
      '  ivec2 ij = tci(gl_VertexID, int(uTS.x));\n' +
      '  vec4 A = texelFetch(uAttr, ij, 0);\n' +
      '  float age = uTime - A.x;\n' +
      '  if (age < 0.){ gl_Position = vec4(2.,2.,0.,1.); gl_PointSize = 0.; vA = 0.; vFl = 0.; return; }\n' +
      '  vec2 p = texelFetch(uPos, ij, 0).xy;\n' +
      '  gl_Position = vec4(project(p), 0., 1.);\n' +
      '  float fl = exp(-age * 3.2);\n' +
      '  float r = length(p);\n' +
      '  float wave = 0.;\n' +
      '  for (int k = 0; k < 4; k++){\n' +
      '    if (uRings[k].y <= 0.) continue;\n' +
      '    wave += exp(-pow((r - uRings[k].x) / (uRings[k].z * 1.6), 2.));\n' +
      '  }\n' +
      '  vFl = fl + wave * .8;\n' +
      '  float breathe = .82 + .18 * sin(uTime * 1.7 + A.z * 6.28);\n' +
      '  gl_PointSize = clamp((0.35 + 3.4 * A.y + uBass * .7) * (1. + vFl * .7) * breathe * uPx * uSizeK, 0.7, 26.);\n' +
      '  vA = clamp(age * 2.2, 0., 1.) * uFade * uAlphaK * (.55 + .45 * breathe + uHigh * .5);\n' +
      '}', '#version 300 es\n' +
      'precision highp float;\n' +
      'in float vA, vFl;\n' +
      'out vec4 outColor;\n' +
      'void main(){\n' +
      '  float d = length(gl_PointCoord - .5) * 2.;\n' +
      '  if (d > 1.) discard;\n' +
      '  float core = smoothstep(1., .05, d);\n' +
      '  float glow = exp(-d * d * 2.6);\n' +
      '  float a = (core * .42 + glow * .30) * vA * (1. + vFl * .7);\n' +
      '  outColor = vec4(vec3(1.), a);\n' +
      '}');

    var pEdge = prog('#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uPos, uAttr, uEdge;\n' +
      'uniform vec2 uTS, uES;\n' +
      'uniform float uTime, uFade, uMid, uEdgeK;\n' +
      'out float vA;\n' + FETCH + '\n' + CAM + '\n' +
      'void main(){\n' +
      '  int eid = gl_VertexID >> 1;\n' +
      '  int end = gl_VertexID & 1;\n' +
      '  vec2 pair = texelFetch(uEdge, tci(eid, int(uES.x)), 0).rg;\n' +
      '  float self  = end == 0 ? pair.r : pair.g;\n' +
      '  float other = end == 0 ? pair.g : pair.r;\n' +
      '  ivec2 si = tc(self, uTS.x), oi = tc(other, uTS.x);\n' +
      '  float ba = texelFetch(uAttr, si, 0).x, bb = texelFetch(uAttr, oi, 0).x;\n' +
      '  float age = uTime - max(ba, bb);\n' +
      '  if (age < 0.){ gl_Position = vec4(2.,2.,0.,1.); vA = 0.; return; }\n' +
      '  gl_Position = vec4(project(texelFetch(uPos, si, 0).xy), 0., 1.);\n' +
      '  vA = clamp(age * 1.4, 0., 1.) * uFade * uEdgeK * (.55 + uMid * .8);\n' +
      '}', '#version 300 es\n' +
      'precision highp float;\n' +
      'in float vA; out vec4 outColor;\n' +
      'void main(){ outColor = vec4(vec3(1.), vA); }');

    /* how wide is the graph right now? one fragment, one strided sweep */
    var pMeas = prog(QUAD_VS, '#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uPos;\n' +
      'uniform vec2 uTS;\n' +
      'uniform float uStride, uCount;\n' +
      'out vec4 outColor;\n' + FETCH + '\n' +
      'void main(){\n' +
      '  float s = 0., c = 0.;\n' +
      '  vec2 m = vec2(0.);\n' +
      '  for (int i = 0; i < 640; i++){\n' +
      '    float id = floor(float(i) * uStride);\n' +
      '    if (id >= uCount) break;\n' +
      '    vec2 q = texelFetch(uPos, tc(id, uTS.x), 0).xy;\n' +
      '    s += dot(q, q); c += 1.;\n' +     /* rms radius shrugs off stray outliers */
      '    m += q;\n' +
      '  }\n' +
      '  c = max(c, 1.);\n' +
      '  outColor = vec4(sqrt(s / c), m / c, 1.);\n' +
      '}');

    /* screen fade — motion trails. Writes toward zero ink, which after the
       inversion below is toward white, so the trail dissolves into the page. */
    var pFade = prog(QUAD_VS, '#version 300 es\n' +
      'precision highp float;\n' +
      'uniform float uAmt; out vec4 outColor;\n' +
      'void main(){ outColor = vec4(0., 0., 0., uAmt); }');

    /* Composite, and the one place the palette lives. Upstream everything is
       white ink on black because that is what an additive buffer does well;
       here that accumulated brightness is read as a quantity of ink and laid
       onto white. The shoulder still runs first, so dense knots roll off
       instead of flooding to flat blue, and the gamma lift pulls single edges
       up out of the paper — a lone line is one thin sample and would otherwise
       sit almost invisible next to the hubs. */
    var pPost = prog(QUAD_VS, '#version 300 es\n' +
      'precision highp float;\n' +
      'uniform sampler2D uSrc; uniform float uGain, uAlpha; uniform vec3 uInk;\n' +
      'in vec2 vUv; out vec4 outColor;\n' +
      'void main(){\n' +
      '  float c = texture(uSrc, vUv).r * uGain;\n' +
      '  c = c / (1. + c * .55);\n' +
      '  float ink = clamp(pow(c, .78), 0., 1.);\n' +
      /* The page is opaque white underneath, so the ink is thinned here rather
         than the canvas being given an opacity: compositing one layer costs a
         multiply, compositing two costs a blend of the whole hero every frame. */
      '  outColor = vec4(mix(vec3(1.), uInk, ink * uAlpha), 1.);\n' +
      '}');

    /* ---------------- topology ---------------- */
    function buildGraph(n) {
      var EC = Math.floor(n * 1.62);
      var TH = Math.ceil(n / TW), ETH = Math.ceil(EC / ETW);
      var pos  = new Float32Array(TW * TH * 4);
      var attr = new Float32Array(TW * TH * 4);
      var nbrA = new Float32Array(TW * TH * 4).fill(-1);
      var nbrB = new Float32Array(TW * TH * 4).fill(-1);
      var rstA = new Float32Array(TW * TH * 4);
      var rstB = new Float32Array(TW * TH * 4);
      var edge = new Float32Array(ETW * ETH * 2);

      var U = 1.25 / Math.sqrt(n);   /* one "spacing unit" — keeps the disc the same size at any count */
      var deg = new Int32Array(n), nc = new Uint8Array(n), nbr = new Float32Array(n * 8).fill(-1);
      var rst = new Float32Array(n * 8);
      var px = new Float32Array(n), py = new Float32Array(n), par = new Int32Array(n);
      var stubs = new Int32Array(EC * 2 + 8), S = 0, E = 0;

      var R = function () { return Math.random(); };
      var stub = function () { return stubs[(R() * S) | 0]; };

      function addEdge(a, b, rest) {
        if (a === b || E >= EC) return false;
        for (var k = 0; k < nc[a]; k++) if (nbr[a * 8 + k] === b) return false;
        edge[E * 2] = a; edge[E * 2 + 1] = b; E++;
        var r = rest || U * (.52 + R() * .62);   /* varied rests keep the lattice from crystallising */
        if (nc[a] < 8) { rst[a * 8 + nc[a]] = r; nbr[a * 8 + nc[a]++] = b; }
        if (nc[b] < 8) { rst[b * 8 + nc[b]] = r; nbr[b * 8 + nc[b]++] = a; }
        deg[a]++; deg[b]++;
        stubs[S++] = a; stubs[S++] = b;
        return true;
      }

      /* three-node seed */
      for (var i = 0; i < 3; i++) {
        var a0 = (i / 3) * 6.2832;
        px[i] = Math.cos(a0) * U; py[i] = Math.sin(a0) * U; par[i] = 0;
      }
      addEdge(0, 1); addEdge(1, 2); addEdge(2, 0);

      /* At this count a rosette every 18 gives two or three of them, which is
         enough for the bloom to be the thing you notice rather than a texture
         you infer. The original's distant-domain rule needs a count this one
         never reaches, so the graph here stays a single growing field. */
      var FLOWER = Math.max(8, CFG.bloom | 0);
      for (var i = 3; i < n; i++) {
        var p;
        if (i % FLOWER === 0 && i + 10 < n && i > 40) {
          /* a rosette: one hub, a ring of petals, each petal holding its
             neighbour's hand. Biased toward the outer edge, so flowers open
             where the graph is still growing. */
          p = stub();
          for (var t = 0; t < 3; t++) {
            var q0 = stub();
            if (px[q0] * px[q0] + py[q0] * py[q0] > px[p] * px[p] + py[p] * py[p]) p = q0;
          }
          var aa = R() * 6.2832, d = U * (1.1 + R() * .7);
          px[i] = px[p] + Math.cos(aa) * d; py[i] = py[p] + Math.sin(aa) * d;
          par[i] = p; addEdge(p, i, d);
          var k = 5 + ((R() * 4) | 0);
          var rp = U * CFG.petal * (.85 + R() * .45);      /* petal reach */
          var ring = 2 * rp * Math.sin(Math.PI / k);       /* exact side of the k-gon: the flower opens */
          for (var j = 0; j < k; j++) {
            var q = i + 1 + j;
            var ang = aa + (j / k) * 6.2832;
            px[q] = px[i] + Math.cos(ang) * rp; py[q] = py[i] + Math.sin(ang) * rp;
            par[q] = i;
            addEdge(i, q, rp);
            if (j > 0) addEdge(q, q - 1, ring);
          }
          addEdge(i + 1, i + k, ring);      /* close the ring */
          i += k;
          continue;
        }
        p = stub();
        var ab = R() * 6.2832, dd = U * (.3 + R() * .5);
        px[i] = px[p] + Math.cos(ab) * dd; py[i] = py[p] + Math.sin(ab) * dd;
        par[i] = p; addEdge(p, i);
        if (R() < CFG.mesh && nc[p] > 1) addEdge(i, nbr[p * 8 + ((R() * nc[p]) | 0)], U * 1.1);   /* triadic closure */
        if (R() < .012) addEdge(i, stub(), U * 5);                                                /* long-range bridge */
      }

      for (var i = 0; i < n; i++) {
        var o = i * 4;
        pos[o] = px[i]; pos[o + 1] = py[i];
        attr[o]     = i < 3 ? 0 : REVEAL * Math.pow(i / (n - 1), .42);   /* birth — a long sparse opening, then a rush */
        attr[o + 1] = Math.min(1, Math.log2(1 + deg[i]) / 6);            /* normalised degree */
        attr[o + 2] = R() * 6.2832;                                      /* phase */
        attr[o + 3] = par[i];
        for (var k = 0; k < 4; k++) {
          nbrA[o + k] = nbr[i * 8 + k];       rstA[o + k] = rst[i * 8 + k];
          nbrB[o + k] = nbr[i * 8 + 4 + k];   rstB[o + k] = rst[i * 8 + 4 + k];
        }
      }
      return { n: n, E: E, TH: TH, ETH: ETH, U: U,
               pos: pos, attr: attr, nbrA: nbrA, nbrB: nbrB, rstA: rstA, rstB: rstB, edge: edge };
    }

    /* ---------------- gpu resources ---------------- */
    var texPos = [], fboPos = [], texAttr, texNbrA, texNbrB, texRstA, texRstB, texEdge;
    var accumTex = null, accumFbo = null, src = 0, fpx = 4;

    function uploadGraph(g) {
      var TH = g.TH;
      [texAttr, texNbrA, texNbrB, texRstA, texRstB, texEdge].forEach(function (t) { if (t) gl.deleteTexture(t); });
      texPos.forEach(function (t) { gl.deleteTexture(t); });
      fboPos.forEach(function (f) { gl.deleteFramebuffer(f); });
      texPos = [tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.pos),
                tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.pos)];
      fboPos = texPos.map(fbo);
      texAttr = tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.attr);
      texNbrA = tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.nbrA);
      texNbrB = tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.nbrB);
      texRstA = tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.rstA);
      texRstB = tex(TW, TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, g.rstB);
      texEdge = tex(ETW, g.ETH, gl.RG32F, gl.RG, gl.FLOAT, g.edge);
      src = 0;
    }

    var texMeas = tex(1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, null);
    var fboMeas = fbo(texMeas);
    var measBuf = new Float32Array(4);
    var extentSmooth = .05, measFrame = 0, cenX = 0, cenY = 0;

    function measure() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboMeas);
      gl.viewport(0, 0, 1, 1);
      gl.useProgram(pMeas);
      bindTex([texPos[src]]);
      gl.uniform1i(pMeas.at('uPos'), 0);
      gl.uniform2f(pMeas.at('uTS'), TW, G.TH);
      gl.uniform1f(pMeas.at('uCount'), G.n);
      gl.uniform1f(pMeas.at('uStride'), Math.max(1, G.n / 640));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, measBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return measBuf[0];
    }

    var fieldA = tex(FIELD, FIELD, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR);
    var fieldT = tex(FIELD, FIELD, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR);
    var fieldB = tex(FIELD, FIELD, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR);
    var fieldC = tex(FIELD, FIELD, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR);
    var fboFieldA = fbo(fieldA), fboFieldT = fbo(fieldT), fboFieldB = fbo(fieldB), fboFieldC = fbo(fieldC);

    var VW = 0, VH = 0, DPR = 1;
    function resize() {
      DPR = Math.min(devicePixelRatio || 1, isMobile ? 2 : 1.6);
      var w = Math.round((host.clientWidth || 1) * DPR);
      var h = Math.round((host.clientHeight || 1) * DPR);
      if (w === VW && h === VH) return;
      VW = cvs.width = w; VH = cvs.height = h;
      if (accumTex) { gl.deleteTexture(accumTex); gl.deleteFramebuffer(accumFbo); }
      /* Half-float, where the original is 8-bit. The trail is a multiplicative
         decay, and in 8 bits it cannot fall below one unit — every frame leaves
         a floor of residue that never clears. On black that is invisible; here
         the image is inverted onto white and the faint end is lifted, so the
         same residue shows up as smear burnt across the page. */
      accumTex = tex(VW, VH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR);
      accumFbo = fbo(accumTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* ---------------- state ---------------- */
    var G = null, dens = 1;
    var clock = 0, collapsing = false, collapseT = 0;
    var zoom = 8, rot = 0, panX = 0, panY = 0, camX = 0, camY = 0;
    var rings = new Float32Array(12);   /* 4 × (radius, amp, width) */
    var ringState = [];

    function newEpoch() {
      G = buildGraph(N);
      uploadGraph(G);
      collapsing = false; collapseT = 0;
      ringState.length = 0;
      clock = 0; zoom = 12; extentSmooth = .04; cenX = cenY = 0;
      dens = clamp(Math.sqrt(3000 / G.n), .34, 1.9);
    }

    /* Three slow sines where the analyser used to be. They only breathe the
       piece — no beat, so no rings; no bar, so the camera never cuts. */
    function levels(t) {
      return {
        bass: .12 + .10 * Math.sin(t * .21),
        mid:  .16 + .10 * Math.sin(t * .13 + 1.7),
        high: .08 + .06 * Math.sin(t * .31 + 3.1)
      };
    }

    /* ---------------- frame ---------------- */
    function step(dt) {
      clock += dt;
      var A = levels(clock);

      if (!collapsing && clock > REVEAL + SETTLE) { collapsing = true; collapseT = 0; }
      if (collapsing) {
        collapseT += dt;
        if (collapseT > COLLAPSE) newEpoch();
      }

      /* the only ring left is the collapse shockwave */
      if (collapsing && ringState.length < 2 && collapseT < .1) ringState.push({ r: .02, amp: 2.2, w: .45, life: 1 });
      for (var i = ringState.length - 1; i >= 0; i--) {
        var rr = ringState[i];
        rr.r += dt * (collapsing ? 1.1 : .62);
        rr.life -= dt * (collapsing ? .5 : 1.35);
        if (rr.life <= 0 || rr.r > 1.6) ringState.splice(i, 1);
      }
      rings.fill(0);
      for (var i = 0; i < ringState.length && i < 4; i++) {
        var r2 = ringState[i];
        rings[i * 3] = r2.r; rings[i * 3 + 1] = r2.amp * Math.max(0, r2.life); rings[i * 3 + 2] = r2.w;
      }

      /* ---- density field ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboFieldA);
      gl.viewport(0, 0, FIELD, FIELD);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pField);
      bindTex([texPos[src], texAttr]);
      gl.uniform1i(pField.at('uPos'), 0); gl.uniform1i(pField.at('uAttr'), 1);
      gl.uniform2f(pField.at('uTS'), TW, G.TH);
      gl.uniform1f(pField.at('uTime'), clock);
      fpx = clamp(G.U * (FIELD / 2), 1.2, 30);
      gl.uniform1f(pField.at('uSize'), clamp(fpx * 1.2, 2.5, 26));
      gl.drawArrays(gl.POINTS, 0, G.n);
      gl.disable(gl.BLEND);

      var fine = Math.max(.6, fpx * .34), coarse = Math.max(2.4, fpx * 1.7);
      gl.useProgram(pBlur);
      gl.uniform1i(pBlur.at('uSrc'), 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboFieldT);
      bindTex([fieldA]); gl.uniform2f(pBlur.at('uDir'), fine / FIELD, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboFieldB);
      bindTex([fieldT]); gl.uniform2f(pBlur.at('uDir'), 0, fine / FIELD); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboFieldT);
      bindTex([fieldB]); gl.uniform2f(pBlur.at('uDir'), coarse / FIELD, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboFieldC);
      bindTex([fieldT]); gl.uniform2f(pBlur.at('uDir'), 0, coarse / FIELD); gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* ---- physics ---- */
      var dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPos[dst]);
      gl.viewport(0, 0, TW, G.TH);
      gl.useProgram(pPhys);
      bindTex([texPos[src], texAttr, texNbrA, texNbrB, fieldB, texRstA, texRstB, fieldC]);
      gl.uniform1i(pPhys.at('uPos'), 0); gl.uniform1i(pPhys.at('uAttr'), 1);
      gl.uniform1i(pPhys.at('uNbrA'), 2); gl.uniform1i(pPhys.at('uNbrB'), 3);
      gl.uniform1i(pPhys.at('uField'), 4);
      gl.uniform1i(pPhys.at('uRstA'), 5); gl.uniform1i(pPhys.at('uRstB'), 6);
      gl.uniform1i(pPhys.at('uCoarse'), 7);
      gl.uniform1f(pPhys.at('uRest'), CFG.rest);
      gl.uniform1f(pPhys.at('uWander'), CFG.wander);
      gl.uniform1f(pPhys.at('uStep'), Math.max(1, fpx * .5) / FIELD);
      gl.uniform2f(pPhys.at('uTS'), TW, G.TH);
      gl.uniform1f(pPhys.at('uTime'), clock);
      gl.uniform1f(pPhys.at('uDt'), Math.min(dt, 1 / 45));
      gl.uniform1f(pPhys.at('uBass'), A.bass);
      gl.uniform1f(pPhys.at('uCollapse'), collapsing ? .85 * Math.min(1, collapseT * 1.4) : 0);
      gl.uniform1f(pPhys.at('uGrav'), CFG.grav);
      /* below ~3 texels per node the field can only quantise, so let the springs take over */
      gl.uniform1f(pPhys.at('uRepel'), CFG.repel * clamp((fpx - 1.1) / 2.4, .12, 1));
      gl.uniform1f(pPhys.at('uSpring'), CFG.spring);
      gl.uniform3fv(pPhys.at('uRings'), rings);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;

      /* ---- camera: it only ever holds the mass in frame ---- */
      if ((measFrame++ % 10) === 0) {
        var m = measure();
        if (m > 0 && isFinite(m)) {
          extentSmooth += (m - extentSmooth) * Math.min(1, dt * 22);
          cenX += (measBuf[1] - cenX) * Math.min(1, dt * 18);
          cenY += (measBuf[2] - cenY) * Math.min(1, dt * 18);
        }
      }
      var extent = Math.max(.02, extentSmooth) * 1.9;   /* rms → visible edge */
      /* Well inside the graph rather than framing all of it. At this magnifi-
         cation the piece is a detail that runs off every edge — a texture of
         nodes and links, not a diagram of one object — which is what lets it
         sit under the type instead of beside it. */
      var fit = 3.4 / extent;
      var zt = fit * (1 + Math.sin(clock * .27) * .05);
      var k2 = Math.min(1, Math.max(0, dt * 1.2));
      zoom += (zt - zoom) * k2;
      zoom = Math.min(30, Math.max(.25, zoom));
      camX += (cenX - camX) * k2;
      camY += (cenY - camY) * k2;
      rot += dt * .018;
      var cr = Math.cos(rot), sr = Math.sin(rot);
      panX = -(camX * cr - camY * sr);
      panY = -(camX * sr + camY * cr);
      var asp = VW / VH;
      var pxp = asp >= 1 ? zoom / asp : zoom, pyp = asp >= 1 ? zoom : zoom * asp;

      /* ---- draw ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);
      gl.viewport(0, 0, VW, VH);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pFade);
      gl.uniform1f(pFade.at('uAmt'), CFG.fade + (collapsing ? .1 : 0));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      var fade = collapsing ? Math.max(0, 1 - Math.pow(collapseT / COLLAPSE, 2.2)) : 1;

      gl.useProgram(pEdge);
      bindTex([texPos[src], texAttr, texEdge]);
      gl.uniform1i(pEdge.at('uPos'), 0); gl.uniform1i(pEdge.at('uAttr'), 1); gl.uniform1i(pEdge.at('uEdge'), 2);
      gl.uniform2f(pEdge.at('uTS'), TW, G.TH);
      gl.uniform2f(pEdge.at('uES'), ETW, G.ETH);
      gl.uniform1f(pEdge.at('uTime'), clock);
      gl.uniform1f(pEdge.at('uFade'), fade);
      gl.uniform1f(pEdge.at('uMid'), A.mid);
      gl.uniform1f(pEdge.at('uEdgeK'), CFG.edgeA * clamp(dens, .5, 1.5));
      gl.uniform2f(pEdge.at('uProj'), pxp, pyp);
      gl.uniform2f(pEdge.at('uPan'), panX, panY);
      gl.uniform1f(pEdge.at('uRot'), rot);
      gl.drawArrays(gl.LINES, 0, G.E * 2);

      gl.useProgram(pNode);
      bindTex([texPos[src], texAttr]);
      gl.uniform1i(pNode.at('uPos'), 0); gl.uniform1i(pNode.at('uAttr'), 1);
      gl.uniform2f(pNode.at('uTS'), TW, G.TH);
      gl.uniform1f(pNode.at('uTime'), clock);
      /* The original caps this at zoom 4 because its camera cuts in close and
         the points would balloon. This one sits at a fixed magnification well
         past that cap, so the cap only ever held the nodes at their wide-shot
         size while the links spread apart around them — all line, no node. */
      gl.uniform1f(pNode.at('uPx'), DPR * Math.pow(Math.min(zoom, 16), .32) * (isMobile ? .9 : 1));
      gl.uniform1f(pNode.at('uBass'), A.bass);
      gl.uniform1f(pNode.at('uHigh'), A.high);
      gl.uniform1f(pNode.at('uFade'), fade);
      gl.uniform1f(pNode.at('uAlphaK'), CFG.nodeA * clamp(dens, .55, 1.2));
      gl.uniform1f(pNode.at('uSizeK'), CFG.nodeS * clamp(dens, .5, 1.25));
      gl.uniform2f(pNode.at('uProj'), pxp, pyp);
      gl.uniform2f(pNode.at('uPan'), panX, panY);
      gl.uniform1f(pNode.at('uRot'), rot);
      gl.uniform3fv(pNode.at('uRings'), rings);
      gl.drawArrays(gl.POINTS, 0, G.n);

      /* ---- composite ---- */
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, VW, VH);
      gl.useProgram(pPost);
      bindTex([accumTex]);
      gl.uniform1i(pPost.at('uSrc'), 0);
      gl.uniform1f(pPost.at('uGain'), CFG.gain);
      gl.uniform1f(pPost.at('uAlpha'), ALPHA);
      gl.uniform3f(pPost.at('uInk'), INK[0], INK[1], INK[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---------------- run ---------------- */
    resize();
    newEpoch();

    /* Arrive at a lattice, not at an empty page. At this speed the reveal
       takes over a minute of wall clock, so the piece is run forward off-screen
       to the point where it is grown but still moving, and the visitor sees it
       from there. */
    clock = REVEAL * .62;
    for (var w = 0; w < 150; w++) step(1 / 60);
    /* The pre-roll is the camera converging as much as the graph settling, and
       every one of those frames went into the accumulator as trail. Wiped, so
       the first frame anyone sees starts on clean paper. */
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(host);
    } else {
      addEventListener('resize', resize, { passive: true });
    }

    var raf = null, last = performance.now(), dead = false;
    function frame(now) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      var dt = (now - last) / 1000;
      last = now;
      if (document.hidden) return;
      if (!(dt > 0)) dt = 1 / 60;          /* first frame, clock skew, tab wake */
      step(Math.min(dt, 1 / 20) * SPEED);
    }
    if (!reduced) raf = requestAnimationFrame(frame);

    return {
      stop: function () {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else removeEventListener('resize', resize);
        /* Hand the driver back rather than waiting for the context to be
           collected: several of these can be built and thrown away in one
           visit as the carousel is stepped through. */
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (cvs.parentNode) cvs.parentNode.removeChild(cvs);
      }
    };
  }
})();
