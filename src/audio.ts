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

// ---------------- BGM ----------------
interface Track { tempo: number; lead: (number | null)[]; bass: (number | null)[]; leadType?: OscillatorType; }
const T = { tempo: 116 };
const BGM: Record<string, Track> = {
  // wistful major — title / quiet
  title: { tempo: 84, leadType: "triangle",
    lead: [76, null, 79, null, 83, null, 79, null, 81, null, 79, null, 76, null, null, null],
    bass: [40, null, 47, null, 45, null, 47, null, 41, null, 48, null, 40, null, 47, null] },
  // warm, homey village
  town: { tempo: T.tempo, leadType: "square",
    lead: [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 81, 79, null],
    bass: [48, null, 55, null, 53, null, 55, null, 50, null, 57, null, 55, null, 52, null] },
  // open-road adventure
  field: { tempo: 126, leadType: "square",
    lead: [69, 72, 74, 76, 74, 72, 69, 67, 65, 67, 69, 72, 74, 72, 69, null],
    bass: [41, 41, 48, 48, 45, 45, 41, 41, 38, 38, 45, 45, 41, 41, 43, 43] },
  // driving battle theme (A minor)
  battle: { tempo: 150, leadType: "square",
    lead: [69, 71, 72, 76, 72, 71, 69, 67, 69, 72, 76, 79, 76, 72, 69, 67],
    bass: [33, 40, 33, 40, 36, 43, 36, 43, 29, 36, 29, 36, 33, 40, 33, 40] },
  // tense boss
  boss: { tempo: 160, leadType: "sawtooth",
    lead: [68, 68, 71, 68, 67, 67, 70, 67, 68, 71, 73, 75, 74, 71, 68, 66],
    bass: [32, 32, 32, 39, 31, 31, 31, 38, 32, 32, 35, 35, 28, 28, 31, 31] },
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
  let i = 0;
  const tick = () => {
    if (!ctx || !musicGain) return;
    const t = ctx.currentTime + 0.02;
    const ln = tr.lead[i % tr.lead.length];
    const bn = tr.bass[i % tr.bass.length];
    if (ln != null) tone(musicGain, mtof(ln), t, stepDur * 0.92, tr.leadType ?? "square", 0.2);
    if (bn != null) tone(musicGain, mtof(bn), t, stepDur * 0.92, "triangle", 0.22);
    i++;
  };
  tick();
  bgmTimer = setInterval(tick, stepDur * 1000);
}
export function stopBgm() { if (bgmTimer != null) { clearInterval(bgmTimer); bgmTimer = null; } currentTrack = ""; }
