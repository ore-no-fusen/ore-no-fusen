/** Aggregate opt-in perf.jsonl without touching the running application. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

export function parsePerfLines(text) {
  const events = [];
  let invalid = 0;
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      events.push(JSON.parse(line));
    } catch {
      invalid += 1;
    }
  }
  return { events, invalid };
}

export function summarize(events) {
  const groups = new Map();
  let dropped = 0;
  for (const event of events) {
    dropped += Number(event.dropped_before ?? 0);
    const key = event.event === 'LAUNCHER_SEARCH_DONE' && event.label
      ? `${event.event} (${event.label})`
      : event.event;
    const group = groups.get(key) ?? { count: 0, success: 0, rejected: 0, failed: 0, values: [] };
    group.count += 1;
    const status = event.meta?.status;
    if (status === 'success') group.success += 1;
    if (status === 'rejected') group.rejected += 1;
    if (status === 'failed') group.failed += 1;
    if (Number.isFinite(event.elapsed_ms)) group.values.push(event.elapsed_ms);
    groups.set(key, group);
  }
  return {
    dropped,
    groups: [...groups.entries()].map(([name, group]) => {
      group.values.sort((a, b) => a - b);
      return {
        name,
        count: group.count,
        success: group.success,
        rejected: group.rejected,
        failed: group.failed,
        p50: percentile(group.values, 50),
        p95: percentile(group.values, 95),
        p99: percentile(group.values, 99),
      };
    }),
  };
}

export function evaluateReadyGate(groups) {
  const ready = groups.find((group) => group.name === 'NOTE_EDITOR_READY')
    ?? groups.find((group) => group.name === 'T2_READY');
  if (!ready || ready.count < 5) return null;
  return { passed: ready.p50 <= 300, name: ready.name, p50: ready.p50 };
}

function main() {
  const path = process.env.PERF_LOG ?? join(process.env.LOCALAPPDATA ?? '', 'ore-no-fusen', 'perf.jsonl');
  if (!existsSync(path)) {
    console.error(`[perf-check] Not found: ${path}`);
    process.exitCode = 1;
    return;
  }
  const { events, invalid } = parsePerfLines(readFileSync(path, 'utf-8'));
  const report = summarize(events);
  console.log(`[perf-check] events=${events.length} invalid=${invalid} dropped=${report.dropped}`);
  for (const group of report.groups) {
    console.log(
      `[perf-check] ${group.name}: count=${group.count} success=${group.success} rejected=${group.rejected} failed=${group.failed} p50=${group.p50 ?? '-'}ms p95=${group.p95 ?? '-'}ms p99=${group.p99 ?? '-'}ms`,
    );
  }
  const gate = evaluateReadyGate(report.groups);
  if (gate && !gate.passed) {
    console.error(`[perf-check] FAIL: ${gate.name} p50 ${gate.p50}ms > 300ms`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
