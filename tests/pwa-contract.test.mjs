import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readPngDimensions(relPath) {
  const buf = readFileSync(new URL(`../${relPath}`, import.meta.url));
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${relPath} must be a valid PNG`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test("PWA manifest defines standalone display mode and home screen metadata", () => {
  const manifestSource = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
  assert.match(manifestSource, /display:\s*"standalone"/);
  assert.match(manifestSource, /short_name:\s*"Isan Air"/);
  assert.match(manifestSource, /start_url:\s*"\/"/);
  assert.match(manifestSource, /purpose:\s*"maskable"/);
});

test("PWA icon suite exists with exact required square dimensions", () => {
  const expected = [
    ["public/icons/icon-192.png", 192, 192],
    ["public/icons/icon-512.png", 512, 512],
    ["public/icons/icon-maskable-192.png", 192, 192],
    ["public/icons/icon-maskable-512.png", 512, 512],
    ["public/icons/apple-touch-icon.png", 180, 180],
  ];
  for (const [relPath, w, h] of expected) {
    assert.ok(existsSync(new URL(`../${relPath}`, import.meta.url)), `missing ${relPath}`);
    const dims = readPngDimensions(relPath);
    assert.equal(dims.width, w, `${relPath} width`);
    assert.equal(dims.height, h, `${relPath} height`);
  }
});

test("Root layout configures Apple Web App standalone mode and viewport cover", () => {
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layoutSource, /viewportFit:\s*"cover"/);
  assert.match(layoutSource, /appleWebApp:\s*\{[\s\S]*capable:\s*true/);
  assert.match(layoutSource, /\/icons\/apple-touch-icon\.png/);
});

test("Service worker is present and never caches privileged cron endpoints", () => {
  const swSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(swSource, /pathname\.startsWith\("\/api\/cron"\)\)\s*return false/);
  assert.match(swSource, /self\.skipWaiting\(\)/);
  assert.match(swSource, /self\.clients\.claim\(\)/);
});
