import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

const DEFAULT_TIMEOUT_MS = 9000;
const PUBLIC_TABLE_PROBES = [
  "profiles",
  "posts",
  "comments",
  "follows",
  "post_likes",
  "workout_sets",
];

const PROTECTED_TABLE_PROBES = [
  "workout_templates",
  "notifications",
  "exercise_prs",
  "direct_messages",
  "user_blocks",
  "content_reports",
  "app_events",
  "beta_feedback",
];

const PUBLIC_COLUMN_PROBES = [
  { table: "posts", columns: "id,media_thumbnail_url" },
];

const PROTECTED_EDGE_FUNCTION_PROBES = ["delete-account"];

const BUCKET_PROBES = ["avatars", "post-media"];

let hasCriticalIssue = false;
let hasWarning = false;

function printLine(icon, title, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${icon} ${title}${suffix}`);
}

function ok(title, detail = "") {
  printLine("OK", title, detail);
}

function warn(title, detail = "") {
  hasWarning = true;
  printLine("WARN", title, detail);
}

function fail(title, detail = "") {
  hasCriticalIssue = true;
  printLine("FAIL", title, detail);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function maskKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "missing";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

function extractDefaultSupabaseConfig(source) {
  const urlMatch = source.match(/const DEFAULT_SUPABASE_URL = "([^"]+)";/);
  const keyMatch = source.match(/const DEFAULT_SUPABASE_ANON_KEY =\s*"([^"]+)";/);
  return {
    url: urlMatch?.[1] || "",
    anonKey: keyMatch?.[1] || "",
  };
}

function extractDefaultLiveSiteUrl(source) {
  const match = source.match(/const DEFAULT_LIVE_SITE_URL = "([^"]+)";/);
  return match?.[1] || "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && typeof setTimeout === "function"
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function safeReadText(response, limit = 220) {
  try {
    const text = await response.text();
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  } catch {
    return "";
  }
}

function checkHeader(headers, key, expectedIncludes = "") {
  const value = String(headers.get(key) || "").trim();
  if (!value) return { ok: false, value: "" };
  if (!expectedIncludes) return { ok: true, value };
  const okValue = value.toLowerCase().includes(String(expectedIncludes).toLowerCase());
  return { ok: okValue, value };
}

async function main() {
  console.log("Trends production readiness check");
  console.log(`Workspace: ${ROOT}`);
  console.log("");

  let liveUrl = "";
  try {
    const appSource = readFileSync(resolve(ROOT, "app.js"), "utf8");
    liveUrl = normalizeUrl(extractDefaultLiveSiteUrl(appSource));
  } catch (error) {
    fail("Read app.js live URL", String(error?.message || error));
  }
  if (!liveUrl) {
    fail("Live site URL", "Missing DEFAULT_LIVE_SITE_URL");
  } else {
    ok("Live site URL", liveUrl);
  }

  let supabaseUrl = "";
  let supabaseAnonKey = "";
  try {
    const supabaseClientSource = readFileSync(resolve(ROOT, "supabaseClient.js"), "utf8");
    const config = extractDefaultSupabaseConfig(supabaseClientSource);
    supabaseUrl = normalizeUrl(config.url);
    supabaseAnonKey = String(config.anonKey || "").trim();
  } catch (error) {
    fail("Read supabaseClient.js", String(error?.message || error));
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    fail("Supabase config", "Missing DEFAULT_SUPABASE_URL or DEFAULT_SUPABASE_ANON_KEY");
  } else {
    ok("Supabase config", `${supabaseUrl} (${maskKey(supabaseAnonKey)})`);
  }

  if (liveUrl) {
    console.log("");
    console.log("Live site checks");

    try {
      const res = await fetchWithTimeout(`${liveUrl}/build-meta.json`, {}, 8000);
      if (!res.ok) {
        fail("build-meta.json", `HTTP ${res.status}`);
      } else {
        const meta = await res.json().catch(() => ({}));
        const version = String(meta?.version || "");
        const builtAt = String(meta?.built_at || meta?.builtAt || "");
        if (!version) {
          warn("build-meta.json", "Missing version field");
        } else if (version === "dev-local") {
          warn("build-meta.json", "version=dev-local (did the deploy build run?)");
        } else {
          ok("build-meta.json", `version=${version}${builtAt ? ` built_at=${builtAt}` : ""}`);
        }
      }
    } catch (error) {
      fail("build-meta.json", String(error?.message || error));
    }

    try {
      const res = await fetchWithTimeout(`${liveUrl}/`, {}, 9000);
      if (!res.ok) {
        fail("GET /", `HTTP ${res.status}`);
      } else {
        ok("GET /", `HTTP ${res.status}`);
      }
      const requiredHeaders = [
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "deny"],
        ["referrer-policy", "strict-origin-when-cross-origin"],
        ["permissions-policy", "camera=()"],
        ["strict-transport-security", "max-age="],
      ];
      requiredHeaders.forEach(([key, expected]) => {
        const result = checkHeader(res.headers, key, expected);
        if (!result.ok) {
          warn(`Header ${key}`, result.value ? `Unexpected: ${result.value}` : "Missing");
        } else {
          ok(`Header ${key}`, result.value);
        }
      });
      // Consume body to avoid open handles in some runtimes.
      await res.arrayBuffer().catch(() => {});
    } catch (error) {
      fail("Live site headers", String(error?.message || error));
    }

    const assets = [
      "/dm-sidebar-tune.css",
      "/styles.css",
      "/app.js",
      "/dm.js",
      "/sw.js",
      "/privacy.html",
      "/terms.html",
      "/contact.html",
    ];
    for (const asset of assets) {
      try {
        const res = await fetchWithTimeout(`${liveUrl}${asset}`, {}, 9000);
        if (!res.ok) {
          fail(`Asset ${asset}`, `HTTP ${res.status}`);
        } else {
          ok(`Asset ${asset}`, `HTTP ${res.status}`);
        }
        await res.arrayBuffer().catch(() => {});
      } catch (error) {
        fail(`Asset ${asset}`, String(error?.message || error));
      }
    }
  }

  if (supabaseUrl && supabaseAnonKey) {
    console.log("");
    console.log("Supabase checks");

    try {
      const res = await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/health`,
        { headers: { apikey: supabaseAnonKey } },
        9000
      );
      if (!res.ok) {
        const body = await safeReadText(res);
        fail("auth/v1/health", `HTTP ${res.status}${body ? ` ${body}` : ""}`);
      } else {
        ok("auth/v1/health", `HTTP ${res.status}`);
      }
      await res.arrayBuffer().catch(() => {});
    } catch (error) {
      fail("auth/v1/health", String(error?.message || error));
    }

    const restHeaders = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    };

    for (const table of PUBLIC_TABLE_PROBES) {
      const url = `${supabaseUrl}/rest/v1/${table}?select=id&limit=1`;
      try {
        const res = await fetchWithTimeout(url, { headers: restHeaders }, 9000);
        const body = await safeReadText(res);
        if (res.ok) {
          ok(`table ${table}`, `HTTP ${res.status}`);
        } else if (res.status === 404 || body.toLowerCase().includes("pgrst205")) {
          fail(`table ${table}`, `Missing or not in schema cache (HTTP ${res.status}) ${body}`);
        } else {
          warn(`table ${table}`, `HTTP ${res.status}${body ? ` ${body}` : ""}`);
        }
      } catch (error) {
        fail(`table ${table}`, String(error?.message || error));
      }
    }

    for (const probe of PUBLIC_COLUMN_PROBES) {
      const url = `${supabaseUrl}/rest/v1/${probe.table}?select=${probe.columns}&limit=1`;
      try {
        const res = await fetchWithTimeout(url, { headers: restHeaders }, 9000);
        const body = await safeReadText(res);
        if (res.ok) {
          ok(`columns ${probe.table}`, probe.columns);
        } else {
          fail(
            `columns ${probe.table}`,
            `HTTP ${res.status}${body ? ` ${body}` : ""}`
          );
        }
      } catch (error) {
        fail(`columns ${probe.table}`, String(error?.message || error));
      }
    }

    for (const table of PROTECTED_TABLE_PROBES) {
      const url = `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`;
      try {
        const res = await fetchWithTimeout(url, { headers: restHeaders }, 9000);
        const body = await safeReadText(res);
        const permissionDenied =
          (res.status === 401 || res.status === 403) &&
          (body.includes("42501") || body.toLowerCase().includes("permission denied"));

        if (permissionDenied) {
          ok(`table ${table}`, `Protected from anon (HTTP ${res.status})`);
        } else if (res.status === 404 || body.toLowerCase().includes("pgrst205")) {
          fail(`table ${table}`, `Missing or not in schema cache (HTTP ${res.status}) ${body}`);
        } else if (res.ok) {
          fail(`table ${table}`, "Unexpected anonymous access");
        } else {
          fail(`table ${table}`, `Unexpected HTTP ${res.status}${body ? ` ${body}` : ""}`);
        }
      } catch (error) {
        fail(`table ${table}`, String(error?.message || error));
      }
    }

    for (const functionName of PROTECTED_EDGE_FUNCTION_PROBES) {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ confirmation: "DELETE" }),
          },
          9000
        );
        const body = await safeReadText(res);
        if (res.status === 401) {
          ok(`function ${functionName}`, "Protected from unauthenticated requests");
        } else {
          fail(
            `function ${functionName}`,
            `Expected HTTP 401, received ${res.status}${body ? ` ${body}` : ""}`
          );
        }
      } catch (error) {
        fail(`function ${functionName}`, String(error?.message || error));
      }
    }

    for (const bucket of BUCKET_PROBES) {
      // Note: /storage/v1/bucket/* requires a user JWT (or service_role) for metadata access.
      // For a public bucket, we can still assert existence via the public object endpoint:
      // - Missing bucket => "Bucket not found"
      // - Existing bucket + missing key => "Object not found" (OK)
      const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/__prod_check_probe__`;
      try {
        const res = await fetchWithTimeout(
          url,
          { headers: { apikey: supabaseAnonKey } },
          9000
        );
        const body = await safeReadText(res);
        const normalized = body.toLowerCase();

        const looksMissingBucket =
          normalized.includes("bucket not found") ||
          normalized.includes("nosuchbucket") ||
          normalized.includes("\"error\":\"bucket not found\"");
        const looksMissingObject =
          normalized.includes("object not found") ||
          normalized.includes("nosuchkey") ||
          normalized.includes("\"error\":\"not_found\"");

        if (looksMissingBucket) {
          fail(`bucket ${bucket}`, `Missing (HTTP ${res.status}) ${body}`);
        } else if (res.ok || looksMissingObject) {
          ok(`bucket ${bucket}`, res.ok ? `HTTP ${res.status}` : `OK (HTTP ${res.status})`);
        } else {
          warn(`bucket ${bucket}`, `HTTP ${res.status}${body ? ` ${body}` : ""}`);
        }

        await res.arrayBuffer().catch(() => {});
      } catch (error) {
        fail(`bucket ${bucket}`, String(error?.message || error));
      }
    }
  }

  console.log("");
  if (hasCriticalIssue) {
    console.log("Summary: BLOCKED (fix FAIL items before go-live).");
    process.exitCode = 1;
    return;
  }
  if (hasWarning) {
    console.log("Summary: MOSTLY OK (review WARN items before inviting users).");
    return;
  }
  console.log("Summary: READY (technical checks passed).");
  console.log("");
  console.log("Manual checks still recommended (real user flow)");
  console.log("1. Sign up / log in (email confirmation settings as intended).");
  console.log("2. Update profile (name + avatar).");
  console.log("3. Post: text, media, workout sets.");
  console.log("4. Comment / like / follow between two accounts.");
  console.log("5. DM: send text + image + reply + reaction.");
  console.log("6. Logged-out: cannot write, private posts hidden.");
}

main().catch((error) => {
  fail("prod-check crashed", String(error?.message || error));
  process.exitCode = 1;
});
