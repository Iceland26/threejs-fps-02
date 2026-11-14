// Procedural sound with WebAudio: no audio files, nothing to load. Every effect is a short
// burst of filtered noise or a plain oscillator — gunshots, the dry click of an empty
// magazine, reload foley, hit ticks, the charge's beeps and the detonation. Volume falls
// with distance for sounds the world makes; the player's own gun is always close.

export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst({ at = 0, dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'lowpass' }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
  }

  function tone({ at = 0, dur = 0.1, from = 440, to = null, gain = 0.2, type = 'square' }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const dist = (d) => Math.max(0.03, Math.min(1, 9 / (9 + d)));

  return {
    unlock() { ensure(); },
    shot(kind, d = 0) {
      const g = dist(d);
      if (kind === 'sniper') {
        noiseBurst({ dur: 0.32, freq: 900, gain: 0.9 * g });
        tone({ dur: 0.18, from: 160, to: 40, gain: 0.5 * g, type: 'sawtooth' });
      } else if (kind === 'shotgun') {
        noiseBurst({ dur: 0.24, freq: 700, gain: 0.85 * g });
      } else if (kind === 'smg') {
        noiseBurst({ dur: 0.07, freq: 2400, gain: 0.5 * g });
      } else if (kind === 'pistol') {
        noiseBurst({ dur: 0.09, freq: 2000, gain: 0.55 * g });
      } else {
        noiseBurst({ dur: 0.13, freq: 1500, gain: 0.65 * g });
      }
    },
    dryFire() { tone({ dur: 0.04, from: 1200, to: 900, gain: 0.12 }); },
    reload() {
      noiseBurst({ dur: 0.05, freq: 3000, gain: 0.2, type: 'highpass' });
      noiseBurst({ at: 0.18, dur: 0.05, freq: 2600, gain: 0.22, type: 'highpass' });
      noiseBurst({ at: 0.42, dur: 0.06, freq: 1800, gain: 0.28, type: 'highpass' });
    },
    hit(head) { tone({ dur: 0.05, from: head ? 1560 : 1180, gain: 0.16, type: 'sine' }); },
    kill() { tone({ dur: 0.09, from: 880, gain: 0.18, type: 'sine' }); tone({ at: 0.07, dur: 0.12, from: 1320, gain: 0.16, type: 'sine' }); },
    hurt() { noiseBurst({ dur: 0.1, freq: 500, gain: 0.3 }); },
    throwIt() { noiseBurst({ dur: 0.08, freq: 900, gain: 0.15, type: 'bandpass' }); },
    explosion(d = 0) {
      const g = dist(d);
      noiseBurst({ dur: 0.9, freq: 300, gain: 1.0 * g });
      tone({ dur: 0.7, from: 110, to: 28, gain: 0.8 * g, type: 'sine' });
    },
    flashbang(d = 0) { tone({ dur: 0.4, from: 3400, to: 3000, gain: 0.1 * dist(d), type: 'sine' }); },
    beep(final) { tone({ dur: final ? 0.3 : 0.07, from: final ? 1560 : 1040, gain: 0.14, type: 'sine' }); },
    plantDone() { tone({ dur: 0.08, from: 1040, gain: 0.15, type: 'sine' }); tone({ at: 0.1, dur: 0.14, from: 1560, gain: 0.15, type: 'sine' }); },
    buy() { tone({ dur: 0.06, from: 1320, gain: 0.12, type: 'sine' }); },
    denied() { tone({ dur: 0.09, from: 220, to: 180, gain: 0.14, type: 'square' }); },
    roundWin() { tone({ dur: 0.12, from: 660, gain: 0.14, type: 'triangle' }); tone({ at: 0.11, dur: 0.2, from: 990, gain: 0.14, type: 'triangle' }); },
    roundLose() { tone({ dur: 0.14, from: 392, gain: 0.14, type: 'triangle' }); tone({ at: 0.13, dur: 0.24, from: 262, gain: 0.14, type: 'triangle' }); },
  };
}
