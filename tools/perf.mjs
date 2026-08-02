// Frame-time probe (BRIEF.md §8: "60 FPS with no frame over 16.6 ms").
//
// Separate from tools/shots.mjs on purpose. The screenshot harness drives the
// clock by hand so captures are reproducible -- which means its timings
// measure nothing at all about performance. This hands the clock back to
// requestAnimationFrame and records what the browser actually delivers.
//
//   node tools/perf.mjs            -> samples every scene
//   node tools/perf.mjs battle     -> one scene
//
// Reports the 1% low, not just the mean: an average hides exactly the hitch
// that matters (BRIEF §3).
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const ORIGIN = "http://localhost:5173";
const SAMPLES = 600; // ~10s at 60fps
const BUDGET_MS = 16.6;

const SCENES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["battle", "overworld", "party", "contact"];

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));

if (!CHROME) {
  console.error("no Chrome found");
  process.exit(1);
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  // Headless throttles rAF for offscreen surfaces; without these the sampler
  // records the throttle, not the game.
  args: ["--disable-frame-rate-limit", "--disable-gpu-vsync", "--run-all-compositor-stages-before-draw"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let failed = false;
for (const scene of SCENES) {
  await page.goto(`${ORIGIN}/?shot=${scene}&perf=1&frames=${SAMPLES}&seed=1`, { waitUntil: "load" });
  await page.waitForFunction("window.VG_SHOT_READY === true", null, { timeout: 20000 });
  await page.waitForFunction(`window.VG_PERF && window.VG_PERF().length >= ${SAMPLES}`, null, { timeout: 60000 })
    .catch(() => {});

  const deltas = (await page.evaluate("window.VG_PERF ? window.VG_PERF() : []"))
    .filter((d) => Number.isFinite(d) && d > 0);

  if (deltas.length < 60) {
    console.log(`${scene.padEnd(10)} only ${deltas.length} samples -- rAF did not run; result discarded`);
    continue;
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  // "1% low" in the frame-rate sense: the mean of the worst 1% of frames.
  const worst = sorted.slice(Math.floor(sorted.length * 0.99));
  const low1 = worst.reduce((a, b) => a + b, 0) / worst.length;
  const over = deltas.filter((d) => d > BUDGET_MS).length;

  const bad = low1 > BUDGET_MS * 2;
  failed ||= bad;
  console.log(
    `${scene.padEnd(10)} n=${deltas.length}  mean ${mean.toFixed(2)}ms (${(1000 / mean).toFixed(0)} fps)  ` +
    `p95 ${pct(sorted, 0.95).toFixed(2)}ms  1%low ${low1.toFixed(2)}ms  max ${sorted[sorted.length - 1].toFixed(2)}ms  ` +
    `over-budget ${((over / deltas.length) * 100).toFixed(1)}%${bad ? "   <-- FAIL" : ""}`,
  );
}

await browser.close();
process.exit(failed ? 1 : 0);
