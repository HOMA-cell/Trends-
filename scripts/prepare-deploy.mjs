import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, "build-meta.json");

function sanitizeBuildVersion(value) {
  const raw = String(value || "").trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || "dev-local";
}

function resolveVersion() {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.COMMIT_SHA,
    process.env.SOURCE_VERSION,
  ];
  const hit = candidates.find((value) => String(value || "").trim());
  if (!hit) return "dev-local";
  return sanitizeBuildVersion(String(hit).trim().slice(0, 12));
}

const payload = {
  version: resolveVersion(),
  built_at: new Date().toISOString(),
};

writeFileSync(`${OUTPUT}`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `build-meta.json updated: version=${payload.version} built_at=${payload.built_at}`
);
