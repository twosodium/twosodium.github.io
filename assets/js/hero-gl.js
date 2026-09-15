// WebGL hero: cached collage background + live network, composited and rippled in a fragment shader.
(function () {
  var glCanvas = document.getElementById('hero-gl');
  if (!glCanvas) return;
  var gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
  if (!gl) { console.warn('[hero-gl] no WebGL; keeping SVG hero'); return; }

  var comp = document.createElement('canvas'), cctx = comp.getContext('2d');
  var letter = document.createElement('canvas'), lctx = letter.getContext('2d');
  var inten = document.createElement('canvas'), ictx = inten.getContext('2d');
  inten.width = 192; inten.height = 108;

  var COLLAGE_BOTTOM = [
    { src: './assets/images/collage/neuron.jpg', ar: 960 / 1365, zoom: 1.6 },
    { src: './assets/images/collage/vanitas.jpg', ar: 960 / 685, bright: 1.9 },
    
    { src: './assets/images/collage/kelp.jpeg', ar: 3156 / 4100 },
    { src: './assets/images/collage/corelli.jpg', ar: 1903 / 1294 }
  ];
  var COLLAGE_TOP = [
    { src: './assets/images/collage/sun1.jpg', ar: 960 / 1513, bright: 0.9 },
    { src: './assets/images/collage/rapier.jpg', ar: 960 / 1527, anchor: 0 },
    { src: './assets/images/collage/sun2.jpg', ar: 960 / 1491, bright: 0.9 }
  ];
  function loadTiles(list) {
    return list.map(function (s) {
      var im = new Image();
      im.onload = function () { bgDirty = true; };
      im.src = s.src;
      return {
        img: im, ar: s.ar,
        anchor: s.anchor == null ? 0.5 : s.anchor,
        zoom: s.zoom == null ? 1 : s.zoom,
        bright: s.bright == null ? 1 : s.bright
      };
    });
  }
  var tilesBottom = loadTiles(COLLAGE_BOTTOM), tilesTop = loadTiles(COLLAGE_TOP);

  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var W = 0, H = 0, letterSX = 1, intenDirty = true, maskDirty = true, bgDirty = true;

  var AMBIENT_AMP = 0.006;   // how far the ripple pushes (radius) everywhere
  var CONTENT_AMP = 0.50;    // extra push under content objects
  var WIGGLE_SPEED = 0.45;   // how fast the ripple moves (independent of radius)
  var BW_CONTRAST = 5;     // background duotone ramp steepness
  var DUO_DARK = [0.357, 0.424, 1.0];  // shadows -> indigo-blue
  var DUO_LIGHT = [1.0, 1.0, 1.0];   // highlights -> white
  var BRIGHT = 0.22;       // lift toward white
  var GRAIN = 0.3;        // animated film grain over the whole hero
  var EDGE_GRAIN = 0;    // stipple/erode the letter edges so they aren't crisp
  var GAP = 10;           // white gutter between collage images (css px)
  var FEATHER = 5;
  var SEL = '.about-text, .pfp, .section-item';

  var vsrc = 'attribute vec2 aPos; varying vec2 vUv;' +
    'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }';
  var fsrc = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uBg;',
    'uniform sampler2D uNet;',
    'uniform sampler2D uInten;',
    'uniform sampler2D uMask;',
    'uniform float uTime;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p);',
    '  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));',
    '  vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }',
    'uniform float uAmbient;',
    'uniform float uContent;',
    'uniform float uSpeed;',
    'uniform float uContrast;',
    'uniform float uGrain;',
    'uniform float uEdgeGrain;',
    'uniform vec3 uDuoDark;',
    'uniform vec3 uDuoLight;',
    'uniform float uBright;',
    'void main(){',
    '  float t = uTime*uSpeed;',
    '  float nx = noise(vUv*3.0 + vec2(t,0.0));',
    '  float ny = noise(vUv*3.0 + vec2(0.0,t) + 19.0);',
    '  float intens = texture2D(uInten, vUv).r;',
    '  float m0 = texture2D(uMask, vUv).r;',
    '  float amp = m0 * uAmbient + intens * uContent;',
    '  vec2 uvD = vUv + (vec2(nx,ny)-0.5) * amp;',
    '  vec4 bg = texture2D(uBg, uvD);',
    '  float lum = dot(bg.rgb, vec3(0.299, 0.587, 0.114));',
    '  float duoT = clamp((lum - 0.5) * uContrast + 0.5 + uBright, 0.0, 1.0);',
    '  vec3 duo = mix(uDuoDark, uDuoLight, duoT);',
    '  float bandLo = 1.0 - 0.93;',
    '  float bandHi = 1.0 - 0.15;',
    '  vec2 nUv = vec2(uvD.x, (uvD.y - bandLo) / (bandHi - bandLo));',
    '  vec3 netRGB = vec3(0.0);',
    '  if (nUv.y >= 0.0 && nUv.y <= 1.0) { vec4 nc = texture2D(uNet, nUv); netRGB = nc.rgb * nc.a; }',
    '  float mask = texture2D(uMask, uvD).r;',
    '  highp float ge = fract(sin(dot(gl_FragCoord.xy, vec2(269.5, 183.3))) * 43758.5453);',
    '  float em = step(0.5, mask + (ge - 0.5) * uEdgeGrain);',
    '  vec3 outc = mix(duo, netRGB, em);',
    '  highp float g = fract(sin(dot(gl_FragCoord.xy + uTime * 10.0, vec2(12.9898, 78.233))) * 43758.5453);',
    '  outc += (g - 0.5) * uGrain;',
    '  gl_FragColor = vec4(outc, 1.0);',
    '}'
  ].join('\n');

  // Compile a shader, logging errors.
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[hero-gl] shader compile:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, vsrc), fs = compile(gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[hero-gl] link:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  function makeTex() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  var bgTex = makeTex(), intenTex = makeTex(), letterTex = makeTex(), netTex = makeTex();

  var uTime = gl.getUniformLocation(prog, 'uTime');
  gl.uniform1i(gl.getUniformLocation(prog, 'uBg'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'uNet'), 3);
  gl.uniform1i(gl.getUniformLocation(prog, 'uInten'), 1);
  gl.uniform1i(gl.getUniformLocation(prog, 'uMask'), 2);
  gl.uniform1f(gl.getUniformLocation(prog, 'uAmbient'), AMBIENT_AMP);
  gl.uniform1f(gl.getUniformLocation(prog, 'uContent'), CONTENT_AMP);
  gl.uniform1f(gl.getUniformLocation(prog, 'uSpeed'), WIGGLE_SPEED);
  gl.uniform1f(gl.getUniformLocation(prog, 'uContrast'), BW_CONTRAST);
  gl.uniform1f(gl.getUniformLocation(prog, 'uGrain'), GRAIN);
  gl.uniform1f(gl.getUniformLocation(prog, 'uEdgeGrain'), EDGE_GRAIN);
  gl.uniform3f(gl.getUniformLocation(prog, 'uDuoDark'), DUO_DARK[0], DUO_DARK[1], DUO_DARK[2]);
  gl.uniform3f(gl.getUniformLocation(prog, 'uDuoLight'), DUO_LIGHT[0], DUO_LIGHT[1], DUO_LIGHT[2]);
  gl.uniform1f(gl.getUniformLocation(prog, 'uBright'), BRIGHT);

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    var pw = Math.max(1, Math.round(W * DPR)), ph = Math.max(1, Math.round(H * DPR));
    comp.width = letter.width = glCanvas.width = pw;
    comp.height = letter.height = glCanvas.height = ph;
    glCanvas.style.width = W + 'px'; glCanvas.style.height = H + 'px';
    gl.viewport(0, 0, pw, ph);
    drawLetters();
    intenDirty = true;
    bgDirty = true;
  }

  function drawLetters() {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, letter.width, letter.height);
    lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
    if (W <= 700) {
      lctx.font = '800 ' + (H * 0.3 * DPR) + 'px "Unbounded", "Arial Narrow", sans-serif';
      var natM = lctx.measureText('ANNA WU').width || 1;
      letterSX = (W * 0.94 * DPR) / natM;
    } else {
      lctx.font = '800 ' + (H * 0.82 * DPR) + 'px "Unbounded", "Arial Narrow", sans-serif';
      var nat = lctx.measureText('ANNA WU').width || 1;
      letterSX = (W * 0.94 * DPR) / nat;
    }
    lctx.save();
    lctx.translate(W * DPR / 2, H * 0.56 * DPR);
    lctx.scale(letterSX, 1);
    lctx.fillStyle = '#fff';
    lctx.fillText('ANNA WU', 0, 0);
    lctx.restore();
    maskDirty = true;
  }

  function tileRects() {
    var nav = document.querySelector('.navbar'), bar = document.querySelector('.musice');
    var top = nav ? nav.getBoundingClientRect().bottom : 0.06 * H;
    var bot = bar ? bar.getBoundingClientRect().top : 0.94 * H;
    var span = bot - top, rowH = span / 2, colW = W / 3;
    var rects = [], i;
    var bx = (W - 4 * colW) / 2;
    for (i = 0; i < tilesBottom.length; i++) {
      var sb = tilesBottom[i];
      rects.push({ x: bx + i * colW, y: top + rowH, w: colW, h: rowH, img: sb.img, anchor: sb.anchor, zoom: sb.zoom, bright: sb.bright });
    }
    var tx = bx + colW / 2;
    for (i = 0; i < tilesTop.length; i++) {
      var st = tilesTop[i];
      rects.push({ x: tx + i * colW, y: top, w: colW, h: rowH, img: st.img, anchor: st.anchor, zoom: st.zoom, bright: st.bright });
    }
    return rects;
  }

  // Draw an image to cover a cell (aspect-preserved, cropped), clipped; anchor 0=top .5=center 1=bottom.
  function drawCover(ctx, img, x, y, w, h, anchor, zoom, bright) {
    var a = anchor == null ? 0.5 : anchor, z = zoom || 1;
    var iar = img.naturalWidth / img.naturalHeight, car = w / h, dw, dh;
    if (iar > car) { dh = h; dw = h * iar; } else { dw = w; dh = w / iar; }
    dw *= z; dh *= z;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (bright && bright !== 1) ctx.filter = 'brightness(' + bright + ')';
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * a, dw, dh);
    ctx.restore();
  }

  // Draw the static collage: white ground plus the gapped, brick-tiled images.
  function composeBg() {
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    cctx.fillStyle = '#fff';
    cctx.fillRect(0, 0, comp.width, comp.height);
    var rects = tileRects(), g = GAP * DPR / 2;
    for (var i = 0; i < rects.length; i++) {
      var s = rects[i];
      if (s.img.complete && s.img.naturalWidth) {
        drawCover(cctx, s.img, s.x * DPR + g, s.y * DPR + g, s.w * DPR - 2 * g, s.h * DPR - 2 * g, s.anchor, s.zoom, s.bright);
      }
    }
  }

  // Draw the intensity map: black baseline, feathered white bumps under objects.
  function drawInten() {
    var iw = inten.width, ih = inten.height, sx = iw / W, sy = ih / H;
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.filter = 'none';
    ictx.globalCompositeOperation = 'source-over';
    ictx.fillStyle = '#000';
    ictx.fillRect(0, 0, iw, ih);
    ictx.filter = 'blur(' + Math.max(1, FEATHER * sx) + 'px)';
    ictx.fillStyle = '#fff';
    var els = document.querySelectorAll(SEL);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom < -FEATHER * 3 || r.top > H + FEATHER * 3) continue;
      ictx.fillRect(r.left * sx, r.top * sy, r.width * sx, r.height * sy);
    }
    ictx.filter = 'none';
  }

  var start = performance.now();
  function frame() {
    if (!document.hidden && !document.body.classList.contains('on-portfolio')) {
      if (bgDirty) {
        composeBg();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, comp);
        bgDirty = false;
      }

      if (intenDirty) {
        drawInten();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, intenTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inten);
        intenDirty = false;
      }

      if (maskDirty) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, letterTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, letter);
        maskDirty = false;
      }

      var net = document.querySelector('#particles-js canvas');
      if (net && net.width) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, netTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, net);
      }

      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frame);
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    resize();
    document.body.classList.add('gl-on');
    frame();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', function () { intenDirty = true; }, { passive: true });
  boot();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLetters);
})();
