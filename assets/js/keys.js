// Keyboard instrument: keys play notes and poke the network.
(function() {
  const KEY_NOTE = {
    a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69,
    u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76, "'": 77, ']': 78
  };
  const SEQ = ['f', 'u', 'k', 'o'];
  let pos = 0;
  let ac = null;

  // Play a short triangle-wave note for the given MIDI number.
  function tone(midi) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (err) {}
  }

  document.addEventListener('keydown', function(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!(key in KEY_NOTE)) return;

    tone(KEY_NOTE[key]);
    if (window.pulseBg) window.pulseBg();
    if (window.stimulateNote) window.stimulateNote(KEY_NOTE[key]);

    if (key === SEQ[pos]) {
      if (++pos === SEQ.length) { pos = 0; window.location.href = './pitch.html'; }
    } else {
      pos = key === SEQ[0] ? 1 : 0;
    }
  });
})();
