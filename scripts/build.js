import { accessSync } from "node:fs";

const required = [
  "index.html",
  "src/styles.css",
  "src/app.js",
  "assets/figma/workspace.png",
  "assets/figma/modal-loading.png",
  "assets/figma/modal-complete.png"
];

for (const file of required) {
  accessSync(file);
}

console.log("Static build verified.");
