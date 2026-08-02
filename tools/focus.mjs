// Focused sprite inspection (BRIEF.md milestone gates).
//
//   node tools/focus.mjs maren            -> docs/shots/_focus/maren.png
//   node tools/focus.mjs maren kael lida  -> one file each, plus silhouettes
//
// Renders a single sprite at the largest integer scale that fits the canvas,
// then a flat-filled silhouette of it. Judging a sprite means looking at it
// large; judging whether it READS means looking at its outline alone.
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ORIGIN = "http://localhost:5173";
const OUT = path.join("docs", "shots", "_focus");
const EXTRA_UPSCALE = 3;

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));

const UPSCALE = ([url, scale]) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode failed"));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width * scale;
      c.height = img.height * scale;
      const x = c.getContext("2d");
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.src = url;
  });

const keys = process.argv.slice(2);
if (!keys.length) {
  console.error("usage: node tools/focus.mjs <sprite-key> [...]");
  process.exit(1);
}
if (!CHROME) {
  console.error("no Chrome found");
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

for (const key of keys) {
  for (const sil of [false, true]) {
    const url = `${ORIGIN}/?shot=contact&focus=${key}${sil ? "&silhouette=1" : ""}&seed=1&frames=30`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction("window.VG_SHOT_READY === true", null, { timeout: 15000 });
    const raw = await page.evaluate("window.VG_SHOT.capture()");
    const big = await page.evaluate(UPSCALE, [raw, EXTRA_UPSCALE]);
    const name = `${key}${sil ? "-silhouette" : ""}.png`;
    await writeFile(path.join(OUT, name), Buffer.from(big.split(",")[1], "base64"));
    console.log("  wrote", name);
  }
}

await browser.close();
