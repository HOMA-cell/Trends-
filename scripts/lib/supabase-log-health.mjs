const LOG_SOURCES = [
  "auth_logs",
  "edge_logs",
  "storage_logs",
  "postgres_logs",
  "function_edge_logs",
  "function_logs",
];

const EXPECTED_PERMISSION_SQLSTATE = "42501";

export function buildLogHealthQuery() {
  const sources = LOG_SOURCES.map((source) => `'${source}'`).join(", ");
  return `select
  source,
  toInt32OrZero(log_attributes['response.status_code']) as status,
  upper(concat(
    coalesce(severity_text, ''),
    coalesce(log_attributes['parsed.error_severity'], '')
  )) as severity,
  upper(coalesce(log_attributes['parsed.sql_state_code'], '')) as sqlstate,
  count() as occurrences,
  max(timestamp) as last_seen
from logs
where source in (${sources})
  and (
    toInt32OrZero(log_attributes['response.status_code']) >= 400
    or upper(coalesce(severity_text, '')) in ('ERROR', 'FATAL', 'PANIC')
    or upper(coalesce(log_attributes['parsed.error_severity'], '')) in ('ERROR', 'FATAL', 'PANIC')
  )
group by source, status, severity, sqlstate
order by last_seen desc
limit 250;`;
}

export function extractLogRows(payload) {
  const candidates = [
    payload,
    payload?.result,
    payload?.data,
    payload?.result?.result,
    payload?.result?.data,
  ];
  const rows = candidates.find(Array.isArray);
  if (!rows) throw new Error("Supabase log response did not contain a result array.");
  return rows;
}

function normalizeRow(row = {}) {
  return {
    source: `${row.source || "unknown"}`.trim() || "unknown",
    status: Number.parseInt(`${row.status ?? 0}`, 10) || 0,
    severity: `${row.severity || ""}`.trim().toUpperCase(),
    sqlstate: `${row.sqlstate || ""}`.trim().toUpperCase(),
    occurrences: Math.max(0, Number.parseInt(`${row.occurrences ?? 0}`, 10) || 0),
    lastSeen: `${row.last_seen || row.lastSeen || ""}`.trim(),
  };
}

export function classifyLogRows(rows) {
  const result = {
    actionable: [],
    expected: [],
    observed: [],
    totals: { actionable: 0, expected: 0, observed: 0 },
  };

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow);
    const isExpectedProtectionResponse =
      row.status === 401 ||
      row.sqlstate === EXPECTED_PERMISSION_SQLSTATE ||
      (row.status === 400 && ["edge_logs", "storage_logs"].includes(row.source));
    const isServerFailure = row.status >= 500 && row.status <= 599;
    const isRateLimitFailure = row.status === 429;
    const isFatal = row.severity.includes("FATAL") || row.severity.includes("PANIC");
    const isDatabaseError =
      row.source === "postgres_logs" &&
      row.severity.includes("ERROR") &&
      row.sqlstate !== EXPECTED_PERMISSION_SQLSTATE;
    const isFunctionError = row.source === "function_logs" && row.severity.includes("ERROR");

    let bucket = "observed";
    if (isExpectedProtectionResponse) bucket = "expected";
    else if (isServerFailure || isRateLimitFailure || isFatal || isDatabaseError || isFunctionError) {
      bucket = "actionable";
    }

    result[bucket].push(row);
    result.totals[bucket] += row.occurrences;
  }

  return result;
}

export function formatLogFinding(row) {
  const fields = [row.source];
  if (row.status) fields.push(`HTTP ${row.status}`);
  if (row.severity) fields.push(row.severity);
  if (row.sqlstate) fields.push(`SQLSTATE ${row.sqlstate}`);
  fields.push(`${row.occurrences} event${row.occurrences === 1 ? "" : "s"}`);
  if (row.lastSeen) fields.push(`last ${row.lastSeen}`);
  return fields.join(" | ");
}

export { LOG_SOURCES };
