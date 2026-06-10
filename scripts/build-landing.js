import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "landing-source");
const distDir = path.join(sourceDir, "dist");
const outputDir = path.join(rootDir, "landing");
const publicAssetsDir = path.join(sourceDir, "public", "home-assets");
const outputAssetsDir = path.join(outputDir, "home-assets");
const workspaceLogoAsset = path.join(rootDir, "assets", "source", "切图", "工作台_首页", "导航栏_logo.png");
const requiredLandingDeps = [
  path.join(sourceDir, "node_modules", "typescript", "bin", "tsc"),
  path.join(sourceDir, "node_modules", "vite", "bin", "vite.js"),
];

if (!existsSync(path.join(sourceDir, "package.json"))) {
  throw new Error("Missing landing-source/package.json");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

if (!requiredLandingDeps.every((depPath) => existsSync(depPath))) {
  run("npm", ["install"], sourceDir);
}

run("npm", ["run", "build", "--", "--base", "./"], sourceDir);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(distDir, outputDir, { recursive: true });
cpSync(publicAssetsDir, outputAssetsDir, { recursive: true });
cpSync(workspaceLogoAsset, path.join(outputAssetsDir, "logo.png"));

const landingAssetsDir = path.join(outputDir, "assets");
for (const file of readdirSync(landingAssetsDir)) {
  if (!file.endsWith(".js")) continue;
  const fullPath = path.join(landingAssetsDir, file);
  const source = readFileSync(fullPath, "utf8").replaceAll('`/home-assets/', '`./home-assets/');
  writeFileSync(fullPath, source);
}

console.log("Landing build prepared.");
