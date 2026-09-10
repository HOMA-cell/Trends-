import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLogHealthQuery,
  classifyLogRows,
  extractLogRows,
  formatLogFinding,
} from "../../scripts/lib/supabase-log-health.mjs";

test("query covers each production service without selecting log messages", () => {
  const query = buildLogHealthQuery();
  for (const source of [
    "auth_logs",
    "edge_logs",
    "storage_logs",
    "postgres_logs",
    "function_edge_logs",
    "function_logs",
  ]) {
    assert.match(query, new RegExp(source));
  }
  assert.doesNotMatch(query, /event_message/i);
  assert.doesNotMatch(query, /select\s+\*/i);
});

test("response parser accepts supported management API envelopes", () => {
  const rows = [{ source: "edge_logs", status: 500 }];
  assert.deepEqual(extractLogRows(rows), rows);
  assert.deepEqual(extractLogRows({ result: rows }), rows);
  assert.deepEqual(extractLogRows({ data: rows }), rows);
  assert.throws(() => extractLogRows({ result: {} }), /result array/);
});

test("expected probes are separated from actionable service failures", () => {
  const health = classifyLogRows([
    { source: "edge_logs", status: 401, occurrences: 5 },
    { source: "storage_logs", status: 400, occurrences: 2 },
    {
      source: "postgres_logs",
      severity: "ERROR",
      sqlstate: "42501",
      occurrences: 3,
    },
    { source: "edge_logs", status: 500, occurrences: 1 },
    { source: "function_logs", severity: "ERROR", occurrences: 4 },
    { source: "auth_logs", status: 400, occurrences: 6 },
  ]);

  assert.equal(health.totals.expected, 10);
  assert.equal(health.totals.actionable, 5);
  assert.equal(health.totals.observed, 6);
});

test("formatted findings never include arbitrary log payload fields", () => {
  const output = formatLogFinding({
    source: "postgres_logs",
    status: 0,
    severity: "ERROR",
    sqlstate: "42P01",
    occurrences: 1,
    lastSeen: "2026-09-10T00:00:00Z",
    event_message: "private content must not be printed",
  });
  assert.match(output, /SQLSTATE 42P01/);
  assert.doesNotMatch(output, /private content/);
});
