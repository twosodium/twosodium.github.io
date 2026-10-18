'use strict';


const NOTE = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const NOTE_SF = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const IS_BLACK = [false,true,false,true,false,false,true,false,true,false,true,false];

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function midiToSfName(m) { return NOTE_SF[m % 12] + (Math.floor(m / 12) - 1); }
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function playFreq(freq, dur = 2.0) {
  const ac = ctx();
  const master = ac.createGain();
  master.connect(ac.destination);
  const partials = [[1, 0.55],[2, 0.22],[3, 0.09],[4, 0.04],[5, 0.02],[6, 0.01]];
  const now = ac.currentTime;
  partials.forEach(([ratio, amp]) => {
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.008);
    g.gain.exponentialRampToValueAtTime(amp * 0.35, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  });
}

const sfCache = {};
async function sfLoad(name) {
  if (sfCache[name]) return sfCache[name];
  sfCache[name] = await Soundfont.instrument(ctx(), name, {
    format: 'mp3', soundfont: 'MusyngKite',
  });
  return sfCache[name];
}
function sfPlay(midi, instName, dur = 1.5) {
  sfLoad(instName).then(inst => {
    inst.play(midiToSfName(midi), ctx().currentTime, { duration: dur });
  });
}

const CG = { notes: [], done: false };

(function buildChordGrid() {
  const g = document.getElementById('chord-grid');
  NOTE.forEach((name, i) => {
    const b = document.createElement('button');
    b.className = 'nb'; b.textContent = name; b.dataset.i = i;
    b.addEventListener('click', () => {
      if (CG.done) return;
      b.classList.toggle('sel');
    });
    g.appendChild(b);
  });
})();

async function chordPlay() {
  const n  = +document.getElementById('chord-n').value;
  const sf = document.getElementById('chord-sf').value;

  CG.done = false;
  const pool = [60,61,62,63,64,65,66,67,68,69,70,71];
  CG.notes = shuffle(pool).slice(0, n);

  document.querySelectorAll('#chord-grid .nb').forEach(b =>
    b.classList.remove('sel','hit','err','miss'));
  document.getElementById('chord-result').textContent = '';
  document.getElementById('chord-result').className = 'result';
  document.getElementById('chord-new').style.display = 'none';
  document.getElementById('chord-submit').disabled = false;
  document.getElementById('chord-replay').disabled = false;
  document.getElementById('chord-dl').disabled     = false;

  const playBtn = document.getElementById('chord-play-btn');
  playBtn.textContent = 'loading…'; playBtn.disabled = true;
  let inst;
  try { inst = await sfLoad(sf); } catch(e) {}
  playBtn.textContent = 'play chord'; playBtn.disabled = false;

  if (inst) {
    const now = ctx().currentTime;
    CG.notes.forEach(m => inst.play(midiToSfName(m), now, { duration: 2.8 }));
  }
}

function chordSubmit() {
  if (!CG.notes.length) return;
  CG.done = true;

  const actual   = new Set(CG.notes.map(m => m % 12));
  const selected = new Set(
    [...document.querySelectorAll('#chord-grid .nb.sel')].map(b => +b.dataset.i)
  );

  let tp = 0;
  document.querySelectorAll('#chord-grid .nb').forEach(b => {
    const i = +b.dataset.i;
    const isA = actual.has(i), isS = selected.has(i);
    b.classList.remove('sel');
    if (isA && isS)  { b.classList.add('hit'); tp++; }
    else if (isA)    { b.classList.add('miss'); }
    else if (isS)    { b.classList.add('err'); }
  });

  const fp = [...selected].filter(i => !actual.has(i)).length;
  const fn = [...actual].filter(i => !selected.has(i)).length;
  const res = document.getElementById('chord-result');

  if (tp === actual.size && fp === 0) {
    res.textContent = `perfect. all ${actual.size} notes correct.`;
    res.className = 'result ok';
  } else {
    const parts = [`${tp}/${actual.size} correct`];
    if (fp) parts.push(`${fp} false positive${fp > 1 ? 's' : ''}`);
    if (fn) parts.push(`missed ${fn}`);
    res.textContent = parts.join(' · ');
    res.className = 'result bad';
    res.innerHTML += `<br><span style="color:#444">actual: ${
      CG.notes.map(m => NOTE[m % 12]).join(' ')
    }</span>`;
  }

  document.getElementById('chord-submit').disabled = true;
  document.getElementById('chord-new').style.display = 'inline-block';
}

document.getElementById('chord-play-btn').addEventListener('click', chordPlay);
document.getElementById('chord-replay').addEventListener('click', async () => {
  const sf = document.getElementById('chord-sf').value;
  const inst = await sfLoad(sf);
  const now = ctx().currentTime;
  CG.notes.forEach(m => inst.play(midiToSfName(m), now, { duration: 2.8 }));
});
document.getElementById('chord-submit').addEventListener('click', chordSubmit);
document.getElementById('chord-new').addEventListener('click', chordPlay);

const MG = { melody: [], input: [], busy: false, done: false, round: 0, startLen: 5, addPerRound: 3 };

(function buildMelodyPiano() {
  const piano = document.getElementById('mel-piano');
  const start = 60, count = 24;

  const wpos = {};
  let wc = 0;
  for (let i = 0; i < count; i++) {
    const m = start + i;
    if (!IS_BLACK[m % 12]) { wpos[m] = wc * 34; wc++; }
  }

  piano.style.width  = (wc * 34) + 'px';
  piano.style.height = '110px';

  for (let i = 0; i < count; i++) {
    const m = start + i;
    const black = IS_BLACK[m % 12];
    const key = document.createElement('div');
    key.dataset.midi = m;
    key.className = black ? 'bk' : 'wk';

    if (black) {
      key.style.left = (wpos[m - 1] + 34 - 11) + 'px';
    } else {
      key.style.left = wpos[m] + 'px';
    }

    key.addEventListener('click', () => melKeyClick(m));
    piano.appendChild(key);
  }
})();

function melKeyClick(midi) {
  if (!MG.melody.length || MG.done) return;
  MG.input.push(midi);
  flashKey('mel-piano', midi, 'seq');
  updateMelInput();
  if (MG.input.length === MG.melody.length) {
    document.getElementById('mel-submit').disabled = false;
  }
}

function updateMelInput() {
  document.getElementById('mel-input').textContent =
    MG.input.map(m => NOTE[m % 12] + (Math.floor(m / 12) - 1)).join(' ');
}

function flashKey(pianoId, midi, cls, ms = 350) {
  const key = document.querySelector(`#${pianoId} [data-midi="${midi}"]`);
  if (!key) return;
  key.classList.add(cls);
  setTimeout(() => key.classList.remove(cls), ms);
}

async function melPlayback(melody) {
  MG.busy = true;
  document.getElementById('mel-play').disabled    = true;
  document.getElementById('mel-replay').disabled  = true;
  document.getElementById('mel-submit').disabled  = true;

  await sfLoad('acoustic_grand_piano');

  for (let i = 0; i < melody.length; i++) {
    if (i > 0) await sleep(520);
    sfPlay(melody[i], 'acoustic_grand_piano', 0.55);
  }

  await sleep(500);
  MG.busy = false;
  document.getElementById('mel-play').disabled   = false;
  document.getElementById('mel-replay').disabled = false;
  document.getElementById('mel-dl').disabled     = false;
}

function melUpdateRoundInfo() {
  const info = document.getElementById('mel-round-info');
  info.style.display = 'block';
  info.textContent = `round ${MG.round}  ·  ${MG.melody.length} notes`;
}

function melStart() {
  MG.startLen    = +document.getElementById('mel-len').value;
  MG.addPerRound = +document.getElementById('mel-add').value;
  MG.round       = 1;
  MG.melody      = Array.from({ length: MG.startLen }, () => 60 + Math.floor(Math.random() * 24));
  MG.input       = [];
  MG.done        = false;

  document.getElementById('mel-submit').disabled    = true;
  document.getElementById('mel-restart').style.display = 'none';
  document.getElementById('mel-result').textContent = '';
  document.getElementById('mel-result').className   = 'result';
  updateMelInput();
  melUpdateRoundInfo();
  melPlayback(MG.melody);
}

function melSubmit() {
  if (MG.done || MG.busy) return;
  MG.done = true;

  const perfect = MG.melody.every((m, i) => m === MG.input[i]);
  const res     = document.getElementById('mel-result');

  if (perfect) {
    res.textContent = `round ${MG.round} ✓  —  +${MG.addPerRound} notes`;
    res.className   = 'result ok';

    setTimeout(() => {
      MG.round++;
      const newNotes = Array.from({ length: MG.addPerRound }, () => 60 + Math.floor(Math.random() * 24));
      MG.melody = [...MG.melody, ...newNotes];
      MG.input = [];
      MG.done  = false;
      res.textContent = '';
      res.className   = 'result';
      document.getElementById('mel-submit').disabled = true;
      updateMelInput();
      melUpdateRoundInfo();
      melPlayback(MG.melody);
    }, 1400);
  } else {
    let correct = 0;
    MG.melody.forEach((m, i) => { if (m === MG.input[i]) correct++; });
    const actual = MG.melody.map(m => NOTE[m % 12] + (Math.floor(m / 12) - 1)).join(' ');
    const rounds = MG.round === 1 ? 'round 1' : `${MG.round} rounds`;
    res.innerHTML =
      `out on round ${MG.round} (${MG.melody.length} notes)  ·  ${correct}/${MG.melody.length} correct` +
      `<br><span style="color:#444">actual: ${actual}</span>`;
    res.className = 'result bad';
    document.getElementById('mel-submit').disabled    = true;
    document.getElementById('mel-restart').style.display = 'inline-block';
  }
}

document.getElementById('mel-play').addEventListener('click', melStart);
document.getElementById('mel-replay').addEventListener('click', () => {
  if (MG.busy || !MG.melody.length) return;
  MG.input = [];
  MG.done  = false;
  document.getElementById('mel-submit').disabled = true;
  updateMelInput();
  melPlayback(MG.melody);
});
document.getElementById('mel-clear').addEventListener('click', () => {
  if (MG.done) return;
  MG.input = [];
  document.getElementById('mel-submit').disabled = true;
  updateMelInput();
});
document.getElementById('mel-submit').addEventListener('click', melSubmit);
document.getElementById('mel-restart').addEventListener('click', melStart);

const TG = { midi: null, cents: null, done: false, selNote: null, selSF: null };

(function buildTuneGrid() {
  const g = document.getElementById('tune-grid');
  NOTE.forEach((name, i) => {
    const b = document.createElement('button');
    b.className = 'nb'; b.textContent = name; b.dataset.i = i;
    b.disabled = true;
    b.addEventListener('click', () => {
      if (TG.done) return;
      document.querySelectorAll('#tune-grid .nb').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      TG.selNote = i;
      document.getElementById('tune-sharp').disabled = false;
      document.getElementById('tune-flat').disabled  = false;
      document.getElementById('tune-hz').disabled    = false;
      document.getElementById('tune-submit').disabled = false;
    });
    g.appendChild(b);
  });
})();

function tunePlay() {
  TG.midi  = 60 + Math.floor(Math.random() * 12);
  TG.cents = (15 + Math.random() * 35) * (Math.random() < 0.5 ? 1 : -1);
  TG.done  = false;
  TG.selNote = null;
  TG.selSF   = null;

  document.querySelectorAll('#tune-grid .nb').forEach(b => {
    b.classList.remove('sel','hit','err'); b.disabled = false;
  });
  document.getElementById('tune-sharp').classList.remove('on');
  document.getElementById('tune-flat').classList.remove('on');
  document.getElementById('tune-sharp').disabled = true;
  document.getElementById('tune-flat').disabled  = true;
  document.getElementById('tune-hz').value    = '';
  document.getElementById('tune-hz').disabled = true;
  document.getElementById('tune-submit').disabled = true;
  document.getElementById('tune-result').textContent = '';
  document.getElementById('tune-result').className   = 'result';
  document.getElementById('tune-new').style.display  = 'none';
  document.getElementById('tune-replay').disabled    = false;
  document.getElementById('tune-dl').disabled        = false;

  const freq = midiToFreq(TG.midi) * Math.pow(2, TG.cents / 1200);
  playFreq(freq, 2.5);
}

document.getElementById('tune-sharp').addEventListener('click', function() {
  this.classList.add('on');
  document.getElementById('tune-flat').classList.remove('on');
  TG.selSF = 'sharp';
});
document.getElementById('tune-flat').addEventListener('click', function() {
  this.classList.add('on');
  document.getElementById('tune-sharp').classList.remove('on');
  TG.selSF = 'flat';
});

function tuneSubmit() {
  TG.done = true;

  const noteOk = TG.selNote === TG.midi % 12;
  const trueDir = TG.cents > 0 ? 'sharp' : 'flat';
  const sfOk    = TG.selSF === trueDir;

  const actualHz = midiToFreq(TG.midi) * Math.pow(2, TG.cents / 1200);

  document.querySelectorAll('#tune-grid .nb').forEach(b => {
    const i = +b.dataset.i;
    b.classList.remove('sel');
    if (i === TG.midi % 12) b.classList.add('hit');
    else if (i === TG.selNote) b.classList.add('err');
  });

  const lines = [];
  if (noteOk && sfOk) {
    lines.push(`correct — ${NOTE[TG.midi % 12]} ${trueDir === 'sharp' ? '♯' : '♭'}`);
  } else {
    lines.push(`the note was ${NOTE[TG.midi % 12]} ${trueDir === 'sharp' ? '♯ (sharp)' : '♭ (flat)'}`);
  }
  lines.push(`detune: ${TG.cents > 0 ? '+' : ''}${TG.cents.toFixed(1)} cents`);
  lines.push(`actual: ${actualHz.toFixed(3)} hz`);

  const hzInput = parseFloat(document.getElementById('tune-hz').value);
  if (!isNaN(hzInput)) {
    const errHz    = Math.abs(hzInput - actualHz);
    const errCents = 1200 * Math.log2(hzInput / actualHz);
    lines.push(`your guess: ${hzInput} hz — off by ${errHz.toFixed(3)} hz (${Math.abs(errCents).toFixed(1)} cents)`);
  }

  const res = document.getElementById('tune-result');
  res.innerHTML   = lines.join('<br>');
  res.className   = (noteOk && sfOk) ? 'result ok' : 'result bad';

  document.getElementById('tune-submit').disabled    = true;
  document.getElementById('tune-new').style.display  = 'inline-block';
}

document.getElementById('tune-play').addEventListener('click', tunePlay);
document.getElementById('tune-replay').addEventListener('click', () => {
  if (TG.midi === null) return;
  const freq = midiToFreq(TG.midi) * Math.pow(2, TG.cents / 1200);
  playFreq(freq, 2.5);
});
document.getElementById('tune-submit').addEventListener('click', tuneSubmit);
document.getElementById('tune-new').addEventListener('click', tunePlay);

const BG = {
  noteA: null, noteB: null,
  low: null, high: null,
  trial: 0, maxTrials: 10,
  curCents: null,
  waiting: false,
};

const BND_PAIRS = (() => {
  const pairs = [];
  for (let m = 48; m <= 82; m++) {
    pairs.push([m, m + 1]);
  }
  return pairs;
})();

(function buildBoundarySelectors() {
  const sel = document.getElementById('bnd-a');
  BND_PAIRS.forEach(([a, b], i) => {
    const opt = document.createElement('option');
    opt.value = i;
    const nameA = NOTE[a % 12] + (Math.floor(a / 12) - 1);
    const nameB = NOTE[b % 12] + (Math.floor(b / 12) - 1);
    opt.textContent = `${nameA} / ${nameB}`;
    if (a === 60) opt.selected = true;
    sel.appendChild(opt);
  });
})();

function bndStart() {
  const pairIdx = +document.getElementById('bnd-a').value;
  const [na, nb] = BND_PAIRS[pairIdx];

  BG.noteA   = na;
  BG.noteB   = nb;
  BG.low     = BG.noteA * 100;
  BG.high    = BG.noteB * 100;
  BG.trial   = 0;
  BG.waiting = false;

  const lA = NOTE[BG.noteA % 12] + (Math.floor(BG.noteA / 12) - 1);
  const lB = NOTE[BG.noteB % 12] + (Math.floor(BG.noteB / 12) - 1);
  document.getElementById('bnd-lbl-a').textContent = lA;
  document.getElementById('bnd-lbl-b').textContent = lB;
  document.getElementById('bnd-na').textContent    = lA;
  document.getElementById('bnd-nb').textContent    = lB;
  document.getElementById('bnd-game').style.display = 'block';
  document.getElementById('bnd-result').textContent = '';
  document.getElementById('bnd-result').className   = 'result';
  document.getElementById('bnd-btn-a').disabled  = true;
  document.getElementById('bnd-btn-b').disabled  = true;
  document.getElementById('bnd-replay').disabled = true;
  document.getElementById('bnd-play').disabled   = false;

  document.getElementById('bnd-meter-wrap').style.display = 'none';
  bndUpdateTrial();
}

function bndUpdateTrial() {
  document.getElementById('bnd-trial').textContent =
    `trial ${BG.trial + 1} / ${BG.maxTrials}`;
}

function bndUpdateMeter() {
  const total      = BG.noteB * 100 - BG.noteA * 100;
  const userCents  = (BG.low + BG.high) / 2;
  const markerPct  = ((userCents - BG.noteA * 100) / total) * 100;

  document.getElementById('bnd-marker').style.left = markerPct + '%';
  document.getElementById('bnd-center').style.left = '50%';
}

function bndPlayNote() {
  if (BG.waiting) return;

  BG.curCents = (BG.low + BG.high) / 2;

  const midiF = BG.curCents / 100;
  const freq  = 440 * Math.pow(2, (midiF - 69) / 12);
  playFreq(freq, 2.0);

  BG.waiting = true;
  document.getElementById('bnd-btn-a').disabled  = false;
  document.getElementById('bnd-btn-b').disabled  = false;
  document.getElementById('bnd-play').disabled   = true;
  document.getElementById('bnd-replay').disabled = false;
  document.getElementById('bnd-dl').disabled     = false;
}

function bndRespond(isA) {
  if (!BG.waiting) return;
  BG.waiting = false;

  if (isA) BG.low  = BG.curCents;
  else      BG.high = BG.curCents;

  BG.trial++;

  document.getElementById('bnd-btn-a').disabled = true;
  document.getElementById('bnd-btn-b').disabled = true;
  document.getElementById('bnd-replay').disabled = true;

  const rangeLeft = BG.high - BG.low;
  const done = BG.trial >= BG.maxTrials || rangeLeft < 4;

  if (done) {
    bndFinish();
  } else {
    bndUpdateTrial();
    document.getElementById('bnd-play').disabled = false;
  }
}

function bndFinish() {
  document.getElementById('bnd-play').disabled = true;
  document.getElementById('bnd-trial').textContent = '';

  const userCents = (BG.low + BG.high) / 2;
  const trueCents = (BG.noteA + BG.noteB) * 50;

  const diffCents = userCents - trueCents;

  const userMidi  = userCents / 100;
  const trueMidi  = trueCents / 100;
  const userHz    = 440 * Math.pow(2, (userMidi - 69) / 12);
  const trueHz    = 440 * Math.pow(2, (trueMidi - 69) / 12);

  const nA = NOTE[BG.noteA % 12] + (Math.floor(BG.noteA / 12) - 1);
  const nB = NOTE[BG.noteB % 12] + (Math.floor(BG.noteB / 12) - 1);

  let biasLine;
  const absDiff = Math.abs(diffCents);
  if (absDiff < 8) {
    biasLine = 'Your boundary is right at the true midpoint! A true pitcher';
  } else if (diffCents > 0) {
    biasLine = `Biased toward ${nA} by ${absDiff.toFixed(0)} cents`;
  } else {
    biasLine = `Biased toward ${nB} by ${absDiff.toFixed(0)} cents`;
  }

  document.getElementById('bnd-meter-wrap').style.display = 'block';
  document.getElementById('bnd-lbl-a').textContent =
    NOTE[BG.noteA % 12] + (Math.floor(BG.noteA / 12) - 1);
  document.getElementById('bnd-lbl-b').textContent =
    NOTE[BG.noteB % 12] + (Math.floor(BG.noteB / 12) - 1);
  bndUpdateMeter();

  const res = document.getElementById('bnd-result');
  res.innerHTML = [
    `after ${BG.trial} trials:`,
    `your boundary: ${userHz.toFixed(1)} hz`,
    `true midpoint: ${trueHz.toFixed(1)} hz&nbsp;&nbsp;(${diffCents > 0 ? '+' : ''}${diffCents.toFixed(0)} cents)`,
    biasLine,
  ].join('<br>');
  res.className = 'result info';
}

document.getElementById('bnd-start').addEventListener('click', bndStart);
document.getElementById('bnd-play').addEventListener('click', bndPlayNote);
document.getElementById('bnd-replay').addEventListener('click', () => {
  if (BG.curCents === null) return;
  const freq = 440 * Math.pow(2, (BG.curCents / 100 - 69) / 12);
  playFreq(freq, 2.0);
});
document.getElementById('bnd-btn-a').addEventListener('click', () => bndRespond(true));
document.getElementById('bnd-btn-b').addEventListener('click', () => bndRespond(false));


function encodeWav(audioBuffer) {
  const samples    = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32767));
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const v   = new DataView(buf);
  const str = (s, o) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str('RIFF', 0); v.setUint32(4, 36 + pcm.byteLength, true);
  str('WAVE', 8); str('fmt ', 12);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str('data', 36); v.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

function offlinePartials(offCtx, freq, startTime, duration) {
  const partials = [[1,0.55],[2,0.22],[3,0.09],[4,0.04],[5,0.02],[6,0.01]];
  partials.forEach(([ratio, amp]) => {
    const osc = offCtx.createOscillator();
    const g   = offCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(amp, startTime + 0.008);
    g.gain.exponentialRampToValueAtTime(amp * 0.35, startTime + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g); g.connect(offCtx.destination);
    osc.start(startTime); osc.stop(startTime + duration + 0.05);
  });
}

async function downloadWav(renderFn, totalDuration, filename) {
  const sampleRate = 44100;
  const offCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalDuration), sampleRate);
  renderFn(offCtx);
  const blob = encodeWav(await offCtx.startRendering());
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename + '.wav';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


document.getElementById('chord-dl').addEventListener('click', () => {
  if (!CG.notes.length) return;
  downloadWav(offCtx => {
    CG.notes.forEach(m => offlinePartials(offCtx, midiToFreq(m), 0, 2.8));
  }, 3.2, 'chord_' + CG.notes.map(m => NOTE_SF[m % 12]).join(''));
});

document.getElementById('mel-dl').addEventListener('click', () => {
  if (!MG.melody.length) return;
  const gap = 0.52, noteDur = 0.55;
  const total = (MG.melody.length - 1) * gap + noteDur + 0.4;
  downloadWav(offCtx => {
    MG.melody.forEach((m, i) => offlinePartials(offCtx, midiToFreq(m), i * gap, noteDur));
  }, total, 'melody');
});

document.getElementById('tune-dl').addEventListener('click', () => {
  if (TG.midi === null) return;
  const freq = midiToFreq(TG.midi) * Math.pow(2, TG.cents / 1200);
  downloadWav(offCtx => offlinePartials(offCtx, freq, 0, 2.5), 2.8,
    'out_of_tune_' + NOTE_SF[TG.midi % 12]);
});

document.getElementById('bnd-dl').addEventListener('click', () => {
  if (BG.curCents === null) return;
  const freq = 440 * Math.pow(2, (BG.curCents / 100 - 69) / 12);
  downloadWav(offCtx => offlinePartials(offCtx, freq, 0, 2.0), 2.3, 'pitch_boundary');
});
