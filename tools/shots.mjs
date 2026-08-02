// Screenshot harness (BRIEF.md §5).
//
// Boots each shot URL in headless Chrome, lets the page advance the game by a
// fixed number of synthetic frames, then reads the canvas back at its native
// 384x216 and writes a PNG. Also writes a 4x nearest-neighbour upscale and, for
// the scenes that need a value-structure check, a greyscale variant.
//
// Deterministic by construction: seeded RNG in the page, manual clock, and
// sprite generation that contains no randomness. Two runs are byte-identical.
//
//   node tools/shots.mjs                  -> docs/shots/<label>/
//   node tools/shots.mjs --label 02-maren
//   node tools/shots.mjs --keep           -> leave the dev server running
//
// Requires a dev server on :5173 (started automatically unless one is up).
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ORIGIN = "http://localhost:5173";
const SEED = 1;
const FRAMES = 90;
const UPSCALE = 4;

/** The fixed scene set. Same shots, same seed, same frame count, every run --
 *  comparison across milestones is the entire point of this harness. */
const SHOTS = [
  { id: "title", grey: false },
  { id: "overworld", grey: true },
  { id: "battle", grey: true },
  { id: "party", grey: false },
  { id: "contact", grey: true },
];

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

async function nextLabel() {
  const explicit = arg("label", null);
  if (explicit) return explicit;
  const dir = "docs/shots";
  if (!existsSync(dir)) return "00-baseline";
  const seen = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory());
  return seen.length === 0 ? "00-baseline" : `${String(seen.length).padStart(2, "0")}-shot`;
}

async function serverUp() {
  try {
    const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const proc = spawn(npm, ["run", "dev"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await serverUp()) return proc;
  }
  proc.kill();
  throw new Error("dev server did not come up on :5173");
}

/** Nearest-neighbour upscale + optional greyscale, done in the page so the
 *  harness needs no image library. Returns a PNG data URL. */
// Takes one packed argument: page.evaluate passes a single value, it does not
// spread an array across parameters.
const TRANSFORM = ([dataUrl, scale, grey]) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode failed"));
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width * scale;
      cv.height = img.height * scale;
      const cx = cv.getContext("2d");
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      if (grey) {
        const d = cx.getImageData(0, 0, cv.width, cv.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          // Rec. 601 luma -- the value structure check in BRIEF.md §8 is about
          // perceived lightness, not a channel average.
          const y = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0;
          p[i] = p[i + 1] = p[i + 2] = y;
        }
        cx.putImageData(d, 0, 0);
      }
      resolve(cv.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });

const writeDataUrl = (file, dataUrl) =>
  writeFile(file, Buffer.from(dataUrl.split(",")[1], "base64"));

async function main() {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error(`no Chrome found; looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`);

  let server = null;
  if (!(await serverUp())) {
    console.log("starting dev server...");
    server = await startServer();
  }

  const label = await nextLabel();
  const outDir = path.join("docs", "shots", label);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  const failures = [];
  for (const shot of SHOTS) {
    const url = `${ORIGIN}/?shot=${shot.id}&seed=${SEED}&frames=${FRAMES}`;
    await page.goto(url, { waitUntil: "load" });
    try {
      await page.waitForFunction("window.VG_SHOT_READY === true", null, { timeout: 15000 });
    } catch {
      failures.push(`${shot.id}: never signalled ready`);
      continue;
    }

    const raw = await page.evaluate("window.VG_SHOT.capture()");
    if (!raw || raw.length < 1000) {
      failures.push(`${shot.id}: canvas read back empty`);
      continue;
    }

    await writeDataUrl(path.join(outDir, `${shot.id}@1x.png`), raw);
    await writeDataUrl(
      path.join(outDir, `${shot.id}@${UPSCALE}x.png`),
      await page.evaluate(TRANSFORM, [raw, UPSCALE, false]),
    );
    if (shot.grey) {
      await writeDataUrl(
        path.join(outDir, `${shot.id}@${UPSCALE}x-grey.png`),
        await page.evaluate(TRANSFORM, [raw, UPSCALE, true]),
      );
    }
    console.log(`  captured ${shot.id}`);
  }

  await browser.close();
  if (server && !hasFlag("keep")) server.kill();

  if (failures.length) {
    console.error(`\nFAILED (${failures.length}):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`\n${SHOTS.length} shots -> ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
