import { accessSync, readFileSync } from "node:fs";

const required = [
  "index.html",
  "src/runtime-config.js",
  "src/styles.css",
  "src/app.js",
  "src/cards.js"
];

for (const file of required) {
  accessSync(file);
}

const sourceFiles = [
  "index.html",
  "src/styles.css",
  "src/app.js",
  "src/cards.js"
];
const assetRefs = new Set();

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/["'(](\.\.\/assets\/[^"'()]+|assets\/[^"'()]+)["')]/g)) {
    const assetPath = match[1].replace(/^\.\.\//, "");
    if (!assetPath.startsWith("assets/")) continue;
    assetRefs.add(decodeURIComponent(assetPath));
  }
}

const missingAssets = [...assetRefs].filter((assetPath) => {
  try {
    accessSync(assetPath);
    return false;
  } catch {
    return true;
  }
});

if (missingAssets.length) {
  throw new Error(`Missing referenced assets:\n${missingAssets.join("\n")}`);
}

console.log(`Static build verified. ${assetRefs.size} assets checked.`);
