import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "feed.js",
  "dm.js",
  "profile.js",
  "i18n.js",
  "supabaseClient.js",
  "sw.js",
  "site.webmanifest",
  "vercel.json",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-pages.yml",
  "supabase/migrations/20260207_000001_baseline_schema_and_policies.sql",
];

const REQUIRED_SCRIPTS = [
  "start",
  "dev",
  "doctor",
  "prepare:deploy",
  "preflight",
  "check",
  "lint",
  "ci",
];

let hasCriticalIssue = false;

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(ROOT, filePath), "utf8"));
}

function printLine(icon, title, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${icon} ${title}${suffix}`);
}

function ok(title, detail = "") {
  printLine("OK", title, detail);
}

function warn(title, detail = "") {
  printLine("WARN", title, detail);
}

function fail(title, detail = "") {
  hasCriticalIssue = true;
  printLine("FAIL", title, detail);
}

function maskKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "missing";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

function extractDefaultSupabaseConfig(source) {
  const urlMatch = source.match(
    /const DEFAULT_SUPABASE_URL = "([^"]+)";/
  );
  const keyMatch = source.match(
    /const DEFAULT_SUPABASE_ANON_KEY =\s*"([^"]+)";/
  );
  return {
    url: urlMatch?.[1] || "",
    anonKey: keyMatch?.[1] || "",
  };
}

function extractDefaultLiveSiteUrl(source) {
  const match = source.match(/const DEFAULT_LIVE_SITE_URL = "([^"]+)";/);
  return match?.[1] || "";
}

function readWorkflowSource(filePath) {
  return readFileSync(resolve(ROOT, filePath), "utf8");
}

function main() {
  console.log("Trends environment doctor");
  console.log(`Workspace: ${ROOT}`);
  console.log("");

  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".")[0] || 0);
  if (nodeMajor === 22) {
    ok("Node.js version", nodeVersion);
  } else if (nodeMajor > 0) {
    warn("Node.js version", `${nodeVersion} detected, CI uses Node 22`);
  } else {
    fail("Node.js version", "Could not read process.versions.node");
  }

  const nvmrcPath = resolve(ROOT, ".nvmrc");
  if (!existsSync(nvmrcPath)) {
    fail(".nvmrc", "Missing Node version pin");
  } else {
    const nvmrc = readFileSync(nvmrcPath, "utf8").trim();
    if (nvmrc === "22") {
      ok(".nvmrc", "Pinned to Node 22");
    } else {
      warn(".nvmrc", `Expected 22, found ${nvmrc || "(empty)"}`);
    }
  }

  const missingFiles = REQUIRED_FILES.filter(
    (filePath) => !existsSync(resolve(ROOT, filePath))
  );
  if (missingFiles.length) {
    fail("Required files", missingFiles.join(", "));
  } else {
    ok("Required files", `${REQUIRED_FILES.length} checked`);
  }

  try {
    const pkg = readJson("package.json");
    const missingScripts = REQUIRED_SCRIPTS.filter(
      (name) => !pkg.scripts || !pkg.scripts[name]
    );
    if (missingScripts.length) {
      fail("package.json scripts", `Missing: ${missingScripts.join(", ")}`);
    } else {
      ok("package.json scripts", REQUIRED_SCRIPTS.join(", "));
    }
    const engine = pkg.engines?.node || "";
    if (engine) {
      ok("package.json engines.node", engine);
    } else {
      warn("package.json engines.node", "Not set");
    }
  } catch (error) {
    fail("package.json", String(error?.message || error));
  }

  try {
    const buildMeta = readJson("build-meta.json");
    ok(
      "build-meta.json",
      `version=${buildMeta.version || "unknown"}, built_at=${buildMeta.built_at || "unknown"}`
    );
  } catch (error) {
    fail("build-meta.json", String(error?.message || error));
  }

  try {
    const supabaseClientSource = readFileSync(
      resolve(ROOT, "supabaseClient.js"),
      "utf8"
    );
    const config = extractDefaultSupabaseConfig(supabaseClientSource);
    if (!config.url || !config.anonKey) {
      fail(
        "Supabase default config",
        "Could not read DEFAULT_SUPABASE_URL / DEFAULT_SUPABASE_ANON_KEY"
      );
    } else {
      ok(
        "Supabase default config",
        `${config.url} (${maskKey(config.anonKey)})`
      );
    }
  } catch (error) {
    fail("Supabase default config", String(error?.message || error));
  }

  try {
    const appSource = readFileSync(resolve(ROOT, "app.js"), "utf8");
    const liveSiteUrl = extractDefaultLiveSiteUrl(appSource);
    if (!liveSiteUrl) {
      fail(
        "Default live site URL",
        "Could not read DEFAULT_LIVE_SITE_URL from app.js"
      );
    } else if (/vercel\.app/i.test(liveSiteUrl)) {
      ok("Default live site URL", liveSiteUrl);
    } else {
      warn(
        "Default live site URL",
        `${liveSiteUrl} (not pointing at the expected Vercel host)`
      );
    }
  } catch (error) {
    fail("Default live site URL", String(error?.message || error));
  }

  try {
    const vercelConfig = readJson("vercel.json");
    const buildCommand = String(vercelConfig.buildCommand || "");
    const installCommand = String(vercelConfig.installCommand || "");
    const outputDirectory = String(vercelConfig.outputDirectory || "");
    if (
      buildCommand === "npm run prepare:deploy" &&
      installCommand === "npm ci" &&
      outputDirectory === "."
    ) {
      ok(
        "vercel.json",
        `build=${buildCommand}, install=${installCommand}, output=${outputDirectory}`
      );
    } else {
      warn(
        "vercel.json",
        `build=${buildCommand || "missing"}, install=${installCommand || "missing"}, output=${outputDirectory || "missing"}`
      );
    }
  } catch (error) {
    fail("vercel.json", String(error?.message || error));
  }

  try {
    const deployWorkflow = readWorkflowSource(".github/workflows/deploy-pages.yml");
    const isManualOnly =
      /workflow_dispatch:/m.test(deployWorkflow) &&
      !/^\s*push:\s*$/m.test(deployWorkflow);
    if (isManualOnly) {
      ok("GitHub Pages fallback workflow", "manual fallback only");
    } else {
      warn(
        "GitHub Pages fallback workflow",
        "Expected workflow_dispatch-only fallback"
      );
    }
  } catch (error) {
    fail("GitHub Pages fallback workflow", String(error?.message || error));
  }

  console.log("");
  console.log("Recommended next steps");
  console.log("1. npm ci");
  console.log("2. npm run preflight");
  console.log("3. npm run dev");
  console.log("4. Open http://127.0.0.1:8000/?fresh=1");
  console.log("5. Verify https://trends-navy-psi.vercel.app/?fresh=1");
  console.log(
    "6. In Settings > Data tools, set the live site URL if you use Vercel or a custom domain"
  );
  console.log(
    "7. Run the Supabase migration in supabase/migrations before inviting real users"
  );

  if (hasCriticalIssue) {
    process.exitCode = 1;
  }
}

main();
