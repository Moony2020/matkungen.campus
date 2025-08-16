// utils/logo.js
const fs = require("fs");
const path = require("path");

let cached;

function resolveLogoPath() {
  const candidates = [
    path.join(process.cwd(), "public", "assets", "images", "logo.png"),
    path.join(process.cwd(), "public", "img", "logo.png"),
    path.join(__dirname, "..", "public", "assets", "images", "logo.png"),
    path.join(__dirname, "..", "public", "img", "logo.png"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function getLogoDataUrl() {
  if (cached) return cached;
  const logoPath = resolveLogoPath();
  if (!logoPath) {
    const transparent1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAucB9WJXy1sAAAAASUVORK5CYII=";
    cached = `data:image/png;base64,${transparent1x1}`;
    return cached;
  }
  const b64 = fs.readFileSync(logoPath, { encoding: "base64" });
  cached = `data:image/png;base64,${b64}`;
  return cached;
}

module.exports = { getLogoDataUrl };
