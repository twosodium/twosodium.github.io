// Audio-reactive spiking neural network in the hero letters; pitch maps to x.
(function() {
  var audioEl = document.getElementById('music');
  if (!audioEl) return;
  audioEl.volume = 0.2;

  var btnToggle = document.getElementById('btn-toggle');
  var toggleIcon = document.getElementById('btn-toggle-icon');

  // Sync the play/pause button to the audio state.
  function updatePlayPauseState() {
    var playing = !audioEl.paused;
    if (toggleIcon) {
      toggleIcon.src = playing ? './assets/images/pause_white.svg' : './assets/images/play_white.svg';
      toggleIcon.alt = playing ? 'Pause' : 'Play';
    }
    if (btnToggle) {
      btnToggle.title = playing ? 'Pause' : 'Play';
      if (playing) btnToggle.classList.add('engaged');
    }
  }
  function toggleAudio() {
    if (audioEl.paused) audioEl.play().catch(function() {});
    else audioEl.pause();
  }
  function restartAudio() { audioEl.currentTime = 0; }

  window.toggleAudio = toggleAudio;
  window.restartAudio = restartAudio;
  audioEl.addEventListener('play', updatePlayPauseState);
  audioEl.addEventListener('pause', updatePlayPauseState);
  updatePlayPauseState();

  // Re-center hover-repulse on the cursor (particles.js ignores the canvas's top offset).
  window.addEventListener('mousemove', function (e) {
    if (!window.pJSDom || !window.pJSDom[0]) return;
    var pJS = window.pJSDom[0].pJS;
    if (!pJS.canvas || !pJS.canvas.el || !pJS.interactivity) return;
    var rect = pJS.canvas.el.getBoundingClientRect();
    var px = pJS.canvas.pxratio || 1;
    pJS.interactivity.mouse.pos_x = (e.clientX - rect.left) * px;
    pJS.interactivity.mouse.pos_y = (e.clientY - rect.top) * px;
  }, { passive: true });

  var MIDI_LO = 48, MIDI_HI = 84;
  var SPEC_N = 48;
  var specX = new Float32Array(SPEC_N);

  // Map a MIDI note to a 0..1 position across the name.
  function pitchFrac(midi) {
    var t = (midi - MIDI_LO) / (MIDI_HI - MIDI_LO);
    return t < 0 ? 0 : (t > 1 ? 1 : t);
  }

  // Hero name box as viewport fractions, matching hero-gl's letters (0.94 width, in the network band).
  function nameBox() {
    return { l: 0.03, r: 0.97, t: 0.15, b: 0.93 };
  }

  var audioCtx = null;
  var analyser = null, dataArray = null;
  var analyserHi = null, dataHi = null;
  var binBucket = null;
  var CHROMA_FLOOR = 80;
  var NOTE_GAIN = 0.085;
  var BPM = 280;
  var BEAT_SEC = 60 / BPM;
  var PULSE_PHASE = 0;        // timestamp (s) of a downbeat, to align the pulse
  var BEATS_PER_PULSE = 2;    // swell every N beats
  var LATENCY_COMP = 0;       // s to look ahead, cancelling the WebGL display lag
  var rafId = null;
  var SMOOTHING = 0.15;
  var smoothedLevel = 0;
  var manualPulse = 0;
  var curLevel = 0;

  var PULSE_STRENGTH = 3;     // size swell per beat
  var FIRE_BLUE = { r: 107, g: 140, b: 255 };  // color a neuron flashes when it fires
  var lastPulseIdx = -1;
  var pulseAmp = 0;

  var LIF = {
    REST: 0, THRESH: 1, RESET: -0.12,
    LEAK: 0.05,
    NOISE: 0.005,
    SYN_WEIGHT: 0.18,
    REFRACTORY_MS: 120,
    FIRE_BUMP: 0.6,
    BUMP_DECAY: 0.80
  };

  // Punch the global breathing pulse from outside (e.g. the keyboard).
  window.pulseBg = function(strength) {
    manualPulse = Math.min(1.2, manualPulse + (strength || 0.32));
  };

  // Excite the neurons whose x-position matches a MIDI note's pitch.
  window.stimulateNote = function(midi) {
    if (!window.pJSDom || !window.pJSDom[0]) return;
    var pJS = window.pJSDom[0].pJS;
    var arr = pJS.particles.array;
    if (!arr || !arr.length) return;
    var box = nameBox();
    if (!box) return;
    var tf = box.l + pitchFrac(midi) * (box.r - box.l);
    var half = (box.r - box.l) / 24;
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      var fx = p.x / pJS.canvas.w;
      if (Math.abs(fx - tf) <= half) {
        p.inbox = (p.inbox || 0) + 3.0;
      }
    }
  };

  // Build the Web Audio analysers on first playback.
  function initAudioAnalyser() {
    if (audioCtx) return true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var source = audioCtx.createMediaElementSource(audioEl);

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = SMOOTHING;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      analyserHi = audioCtx.createAnalyser();
      analyserHi.fftSize = 4096;
      analyserHi.smoothingTimeConstant = 0.5;
      source.connect(analyserHi);
      dataHi = new Uint8Array(analyserHi.frequencyBinCount);

      binBucket = new Int16Array(analyserHi.frequencyBinCount);
      var sr = audioCtx.sampleRate;
      for (var bi = 0; bi < binBucket.length; bi++) {
        var freq = bi * sr / analyserHi.fftSize;
        var midi = 69 + 12 * Math.log2(freq / 440);
        if (freq >= 55 && midi >= MIDI_LO && midi <= MIDI_HI) {
          var bk = (pitchFrac(midi) * SPEC_N) | 0;
          binBucket[bi] = bk >= SPEC_N ? SPEC_N - 1 : bk;
        } else {
          binBucket[bi] = -1;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Read overall loudness into curLevel.
  function readSpectrum() {
    if (!analyser || !dataArray) { curLevel = 0; return; }
    analyser.getByteFrequencyData(dataArray);
    var sum = 0;
    for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
    curLevel = (sum / dataArray.length) / 255;
  }

  // Fold the high-res FFT into the normalized spectrogram specX.
  function readSpectroX() {
    if (!analyserHi || !dataHi) { specX.fill(0); return; }
    analyserHi.getByteFrequencyData(dataHi);
    specX.fill(0);
    for (var b = 0; b < binBucket.length; b++) {
      if (binBucket[b] >= 0) specX[binBucket[b]] += dataHi[b];
    }
    var max = 0;
    for (var i = 0; i < SPEC_N; i++) if (specX[i] > max) max = specX[i];
    if (max < CHROMA_FLOOR) { specX.fill(0); return; }
    for (var i = 0; i < SPEC_N; i++) specX[i] /= max;
  }

  // Per-frame: integrate neurons, excite by spectrogram, propagate, render.
  function pulseParticles() {
    if (!window.pJSDom || !window.pJSDom[0]) {
      rafId = requestAnimationFrame(pulseParticles);
      return;
    }
    var pJS = window.pJSDom[0].pJS;
    var arr = pJS.particles.array;
    if (!arr || !arr.length) {
      rafId = requestAnimationFrame(pulseParticles);
      return;
    }
    if (document.hidden || document.body.classList.contains('on-portfolio')) {
      rafId = requestAnimationFrame(pulseParticles);
      return;
    }
    manualPulse *= 0.86;
    if (manualPulse < 0.001) manualPulse = 0;

    readSpectrum();
    readSpectroX();
    smoothedLevel = curLevel + manualPulse;

    var noteGain = audioEl.paused ? 0 : NOTE_GAIN;

    var pp = BEATS_PER_PULSE * BEAT_SEC;
    var phase = (audioEl.currentTime + LATENCY_COMP - PULSE_PHASE) / pp;
    var pulseIdx = Math.floor(phase);
    if (pulseIdx !== lastPulseIdx) {
      lastPulseIdx = pulseIdx;
      pulseAmp = audioEl.paused ? 0 : smoothedLevel;
    }
    var env = 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase - pulseIdx));
    var pulseScale = audioEl.paused ? 1 : (1 + PULSE_STRENGTH * pulseAmp * env);

    var box = nameBox();
    var boxW = box ? (box.r - box.l) : 0;
    var linkDist = pJS.particles.line_linked.distance || 100;
    var linkDist2 = linkDist * linkDist;
    var now = Date.now();

    var fired = null;
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (p.baseRadius === undefined) p.baseRadius = p.radius;
      if (p.baseRgb === undefined && p.color && p.color.rgb) p.baseRgb = { r: p.color.rgb.r, g: p.color.rgb.g, b: p.color.rgb.b };
      if (p.v === undefined) { p.v = Math.random() * 0.4; p.fireBump = 0; p.inbox = 0; p.fireGlow = 0; }

      if (now >= (p.refractoryUntil || 0)) {
        var input = LIF.NOISE * Math.random() + (p.inbox || 0);
        if (box && noteGain > 0 && boxW > 0) {
          var fx = p.x / pJS.canvas.w;
          if (fx >= box.l && fx <= box.r) {
            var bk = (((fx - box.l) / boxW) * SPEC_N) | 0;
            if (bk >= SPEC_N) bk = SPEC_N - 1;
            input += noteGain * specX[bk];
          }
        }
        p.v += (LIF.REST - p.v) * LIF.LEAK + input;
        if (p.v >= LIF.THRESH) {
          p.v = LIF.RESET;
          p.refractoryUntil = now + LIF.REFRACTORY_MS;
          p.fireBump = LIF.FIRE_BUMP;
          p.fireGlow = 1;
          (fired || (fired = [])).push(p);
        }
      }
      p.inbox = 0;
    }

    if (fired) {
      for (var f = 0; f < fired.length; f++) {
        var src = fired[f];
        for (var j = 0; j < arr.length; j++) {
          var q = arr[j];
          if (q === src) continue;
          var dx = q.x - src.x, dy = q.y - src.y;
          if (dx * dx + dy * dy <= linkDist2) q.inbox = (q.inbox || 0) + LIF.SYN_WEIGHT;
        }
      }
    }

    for (var k = 0; k < arr.length; k++) {
      var r = arr[k];
      r.radius = Math.max(0.1, r.baseRadius * pulseScale * (1 + (r.fireBump || 0)));
      if (r.fireBump) { r.fireBump *= LIF.BUMP_DECAY; if (r.fireBump < 0.02) r.fireBump = 0; }

      if (r.baseRgb && r.color && r.color.rgb) {
        if (r.fireGlow > 0.02) {
          var tg = r.fireGlow;
          r.color.rgb.r = Math.round(r.baseRgb.r + (FIRE_BLUE.r - r.baseRgb.r) * tg);
          r.color.rgb.g = Math.round(r.baseRgb.g + (FIRE_BLUE.g - r.baseRgb.g) * tg);
          r.color.rgb.b = Math.round(r.baseRgb.b + (FIRE_BLUE.b - r.baseRgb.b) * tg);
          r.fireGlow *= 0.90;
        } else if (r.fireGlow) {
          r.fireGlow = 0;
          r.color.rgb.r = r.baseRgb.r; r.color.rgb.g = r.baseRgb.g; r.color.rgb.b = r.baseRgb.b;
        }
      }

      if (r.repulseBrightUntil && now < r.repulseBrightUntil) {
        r.brightenAmount = 1;
      } else if (r.brightenAmount > 0) {
        r.brightenAmount *= 0.90;
        if (r.brightenAmount < 0.02) r.brightenAmount = 0;
      }
      if (r.repulseBrightUntil && now >= r.repulseBrightUntil) r.repulseBrightUntil = undefined;
    }
    rafId = requestAnimationFrame(pulseParticles);
  }

  audioEl.addEventListener('play', function onPlay() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (!initAudioAnalyser()) return;
    if (!rafId) pulseParticles();
  });

  pulseParticles();
})();
