import { accessSync } from "node:fs";

const required = [
  "index.html",
  "src/styles.css",
  "src/app.js",
  "assets/figma/copy-default.svg",
  "assets/figma/copy-done.svg"
];

for (const file of required) {
  accessSync(file);
}

console.log("Static build verified.");
