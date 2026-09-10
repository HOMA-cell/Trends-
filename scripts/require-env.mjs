import process from "node:process";

const requiredNames = process.argv.slice(2).filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
if (!requiredNames.length) {
  console.error("FAIL No environment variable names were provided.");
  process.exit(1);
}

const missing = requiredNames.filter((name) => !`${process.env[name] || ""}`.trim());
if (missing.length) {
  console.error(`FAIL Missing required configuration: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`OK Required configuration is present: ${requiredNames.join(", ")}`);
