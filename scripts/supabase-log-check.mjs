import process from "node:process";
import {
  buildLogHealthQuery,
  classifyLogRows,
  extractLogRows,
  formatLogFinding,
} from "./lib/supabase-log-health.mjs";

const accessToken = `${process.env.SUPABASE_ACCESS_TOKEN || ""}`.trim();
const projectRef = `${process.env.SUPABASE_PROJECT_REF || ""}`.trim();
const apiBaseUrl = `${process.env.SUPABASE_MANAGEMENT_API_URL || "https://api.supabase.com"}`.trim();
const hours = Math.min(24, Math.max(1, Number.parseInt(process.env.SUPABASE_LOG_WINDOW_HOURS || "24", 10) || 24));

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN is not configured.");
if (!/^[a-z0-9]{20}$/.test(projectRef)) fail("SUPABASE_PROJECT_REF is missing or invalid.");

if (!process.exitCode) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const endpoint = new URL(
    `/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/logs`,
    apiBaseUrl
  );
  endpoint.searchParams.set("iso_timestamp_start", start.toISOString());
  endpoint.searchParams.set("iso_timestamp_end", end.toISOString());
  endpoint.searchParams.set("sql", buildLogHealthQuery());

  try {
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "user-agent": "TrendsProductionMonitor/1.0",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      fail(`Supabase logs API returned HTTP ${response.status}.`);
    } else {
      const payload = await response.json();
      const rows = extractLogRows(payload);
      const health = classifyLogRows(rows);

      console.log(`OK Supabase logs queried for the last ${hours} hours.`);
      console.log(`OK Expected protection responses: ${health.totals.expected}`);
      console.log(`OK Non-server client events observed: ${health.totals.observed}`);

      if (health.actionable.length) {
        console.error(`FAIL Actionable Supabase log events: ${health.totals.actionable}`);
        health.actionable.forEach((row) => console.error(`- ${formatLogFinding(row)}`));
        process.exitCode = 1;
      } else {
        console.log("OK No actionable Auth, API, Storage, Postgres, or Edge Function errors.");
      }
    }
  } catch (error) {
    fail(`Supabase logs query failed: ${error?.message || error}`);
  }
}
