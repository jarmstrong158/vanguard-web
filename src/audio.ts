// Procedural chiptune audio — no asset files. Synthesizes BGM loops and SFX with
// the Web Audio API (square/triangle "NES-ish" voices). Safe no-ops if Web Audio
// is unavailable or the context can't start (browsers require a user gesture first).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = false;
const VOL = 0.22;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.55; musicGain.connect(master);
  }
  return ctx;
}

// Call on the first user gesture (browsers suspend audio until then).
export function resumeAudio() { const c = ac(); if (c && c.state === "suspended") c.resume().catch(() => {}); }
export function toggleMute(): boolean { muted = !muted; if (master) master.gain.value = muted ? 0 : VOL; return muted; }
export function isMuted() { return muted; }

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// one enveloped tone
function tone(dest: AudioNode, f: number, t0: number, dur: number, type: OscillatorType, vol: number) {
  const c = ctx!; const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// ---------------- SFX ----------------
type SfxName = "move" | "confirm" | "cancel" | "hit" | "crit" | "heal" | "victory" | "levelup" | "buy" | "error" | "step";
const SFX: Record<SfxName, { n: number; d: number; type: OscillatorType; vol: number }[]> = {
  move:    [{ n: 84, d: 0.05, type: "square", vol: 0.18 }],
  confirm: [{ n: 79, d: 0.05, type: "square", vol: 0.2 }, { n: 86, d: 0.08, type: "square", vol: 0.2 }],
  cancel:  [{ n: 72, d: 0.06, type: "square", vol: 0.18 }, { n: 65, d: 0.09, type: "square", vol: 0.18 }],
  hit:     [{ n: 50, d: 0.06, type: "square", vol: 0.22 }, { n: 43, d: 0.08, type: "sawtooth", vol: 0.18 }],
  crit:    [{ n: 60, d: 0.05, type: "square", vol: 0.24 }, { n: 67, d: 0.06, type: "square", vol: 0.24 }, { n: 72, d: 0.1, type: "square", vol: 0.22 }],
  heal:    [{ n: 72, d: 0.07, type: "triangle", vol: 0.2 }, { n: 76, d: 0.07, type: "triangle", vol: 0.2 }, { n: 79, d: 0.12, type: "triangle", vol: 0.2 }],
  victory: [{ n: 72, d: 0.12, type: "square", vol: 0.22 }, { n: 76, d: 0.12, type: "square", vol: 0.22 }, { n: 79, d: 0.12, type: "square", vol: 0.22 }, { n: 84, d: 0.3, type: "square", vol: 0.24 }],
  levelup: [{ n: 72, d: 0.08, type: "square", vol: 0.2 }, { n: 76, d: 0.08, type: "square", vol: 0.2 }, { n: 79, d: 0.08, type: "square", vol: 0.2 }, { n: 83, d: 0.08, type: "square", vol: 0.2 }, { n: 86, d: 0.2, type: "square", vol: 0.22 }],
  buy:     [{ n: 88, d: 0.05, type: "square", vol: 0.18 }, { n: 91, d: 0.08, type: "square", vol: 0.18 }],
  error:   [{ n: 48, d: 0.14, type: "sawtooth", vol: 0.2 }],
  step:    [{ n: 55, d: 0.03, type: "triangle", vol: 0.08 }],
};
export function sfx(name: SfxName) {
  const c = ac(); if (!c || !master) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const seq = SFX[name]; let t = c.currentTime;
  for (const s of seq) { tone(master, mtof(s.n), t, s.d, s.type, s.vol); t += s.d * 0.7; }
}

// ---------------- percussion (filtered noise) ----------------
let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  const c = ctx!;
  if (!noiseBuf) { const len = Math.floor(c.sampleRate * 0.3); noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
  return noiseBuf;
}
function perc(kind: "k" | "h" | "s", t0: number, vol: number) {
  const c = ctx!; if (!musicGain) return;
  if (kind === "k") {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    g.gain.setValueAtTime(vol * 1.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.18);
  } else {
    const src = c.createBufferSource(); src.buffer = noiseBuffer();
    const f = c.createBiquadFilter(); f.type = kind === "s" ? "bandpass" : "highpass"; f.frequency.value = kind === "s" ? 1600 : 7500;
    const g = c.createGain(); const dur = kind === "s" ? 0.13 : 0.035;
    g.gain.setValueAtTime((kind === "s" ? 0.5 : 0.35) * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(musicGain); src.start(t0); src.stop(t0 + dur + 0.02);
  }
}

// ---------------- BGM ----------------
// Tracks are 32 eighth-notes (4 bars) with lead + bass + optional harmony, plus a
// procedural drum groove. On every other loop the lead jumps an octave for an A/A'
// "verse/chorus" feel, so a loop spans 8 bars before truly repeating.
interface Track { tempo: number; leadType?: OscillatorType; lead: (number | null)[]; bass: (number | null)[]; harm?: (number | null)[]; drums?: number; }
const _ = null;
const BGM: Record<string, Track> = {
  // reflective, sparse, Am — over the title screen
  title: { tempo: 82, leadType: "triangle", drums: 0,
    lead: [76, _, 79, _, 81, _, 79, _, 76, _, 72, _, 74, _, _, _, 77, _, 81, _, 84, _, 81, _, 79, _, 76, _, 74, _, _, _],
    bass: [45, _, _, _, 52, _, _, _, 41, _, _, _, 48, _, _, _, 48, _, _, _, 55, _, _, _, 43, _, _, _, 50, _, _, _],
    harm: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
  // warm village waltz-y tune — C Am F G / C F G C
  town: { tempo: 120, leadType: "square", drums: 0.5,
    lead: [72, 76, 79, 83, 81, 79, 76, 74, 72, 74, 76, 72, 69, 71, 72, _, 77, 81, 84, 81, 79, 77, 76, 74, 79, 76, 74, 71, 72, _, _, _],
    bass: [48, _, 55, _, 48, _, 55, _, 45, _, 52, _, 45, _, 52, _, 41, _, 48, _, 41, _, 48, _, 43, _, 50, _, 48, _, 55, _],
    harm: [79, _, _, _, 76, _, _, _, 76, _, _, _, 72, _, _, _, 84, _, _, _, 81, _, _, _, 83, _, _, _, 79, _, _, _] },
  // upbeat open-road adventure — F C Dm Bb (bright)
  field: { tempo: 132, leadType: "square", drums: 0.6,
    lead: [77, 81, 84, 81, 79, 77, 76, 77, 72, 76, 79, 76, 74, 72, 71, 72, 74, 77, 81, 77, 76, 74, 72, 74, 70, 74, 77, 74, 72, 71, 69, _],
    bass: [41, 48, 41, 48, 36, 43, 36, 43, 38, 45, 38, 45, 34, 41, 34, 41, 41, 48, 41, 48, 36, 43, 36, 43, 38, 45, 38, 45, 43, 43, 43, 43],
    harm: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
  // driving battle theme — Am F G E
  battle: { tempo: 152, leadType: "square", drums: 0.85,
    lead: [69, 72, 76, 72, 71, 69, 67, 69, 65, 69, 72, 69, 67, 65, 64, 65, 67, 71, 74, 71, 69, 67, 66, 67, 68, 71, 68, 67, 64, 67, 71, 76],
    bass: [33, 40, 33, 40, 33, 40, 33, 40, 29, 36, 29, 36, 29, 36, 29, 36, 31, 38, 31, 38, 31, 38, 31, 38, 28, 35, 28, 35, 28, 35, 28, 35],
    harm: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
  // tense, chromatic boss theme — Dm / diminished pushes
  boss: { tempo: 164, leadType: "sawtooth", drums: 1,
    lead: [74, 74, 77, 74, 73, 73, 75, 73, 74, 77, 79, 81, 80, 77, 74, 72, 74, 74, 77, 79, 78, 77, 75, 74, 73, 75, 77, 78, 79, 81, 80, 78],
    bass: [38, 38, 45, 38, 37, 37, 44, 37, 38, 38, 45, 38, 33, 33, 40, 33, 38, 38, 45, 38, 37, 37, 44, 37, 35, 35, 42, 35, 38, 45, 38, 45],
    harm: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
};

let bgmTimer: ReturnType<typeof setInterval> | null = null;
let currentTrack = "";
export function playBgm(name: string) {
  if (name === currentTrack) return;
  const c = ac(); if (!c || !musicGain) { currentTrack = name; return; }
  if (c.state === "suspended") c.resume().catch(() => {});
  stopBgm();
  const tr = BGM[name]; if (!tr) { currentTrack = ""; return; }
  currentTrack = name;
  const stepDur = 60 / tr.tempo / 2; // eighth notes
  const len = tr.lead.length;
  let i = 0;
  const tick = () => {
    if (!ctx || !musicGain) return;
    const t = ctx.currentTime + 0.02;
    const step = i % len;
    const chorus = Math.floor(i / len) % 2 === 1;  // every other pass: lead up an octave
    const ln = tr.lead[step];
    if (ln != null) tone(musicGain, mtof(ln + (chorus ? 12 : 0)), t, stepDur * 0.9, tr.leadType ?? "square", chorus ? 0.16 : 0.2);
    const bn = tr.bass[step];
    if (bn != null) tone(musicGain, mtof(bn), t, stepDur * 1.5, "triangle", 0.22);
    const hn = tr.harm?.[step];
    if (hn != null) tone(musicGain, mtof(hn), t, stepDur * 1.8, "triangle", 0.09);
    // drum groove: kick on the beat, snare on the backbeat, hats on offbeats
    if (tr.drums) {
      const v = tr.drums;
      if (step % 4 === 0) perc("k", t, v);
      if (step % 8 === 4) perc("s", t, v);
      if (step % 2 === 1) perc("h", t, v * 0.7);
    }
    i++;
  };
  tick();
  bgmTimer = setInterval(tick, stepDur * 1000);
}
export function stopBgm() { if (bgmTimer != null) { clearInterval(bgmTimer); bgmTimer = null; } currentTrack = ""; }
