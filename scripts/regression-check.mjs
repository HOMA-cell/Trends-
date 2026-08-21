import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const feedSource = await readFile(new URL("../feed.js", import.meta.url), "utf8");
const failures = [];

if (/\bt\s*\(/.test(feedSource)) {
  failures.push("feed.js must index the i18n dictionary (t[lang]); t is not a function");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK Regression checks - ${root}`);
}
