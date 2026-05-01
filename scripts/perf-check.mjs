/**
 * perf-check.mjs
 *
 * JSON Lines (perf.jsonl) を読み込み、run_id 毎に T2_READY を集計して
 * 5 サンプル以上の中央値が 300ms 以内なら exit 0、それ以外は exit 1 を返す。
 *
 * 使い方:
 *   npm run perf:check
 *   PERF_LOG=./fixture.jsonl node scripts/perf-check.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const path =
  process.env.PERF_LOG ??
  join(process.env.LOCALAPPDATA ?? '', 'ore-no-fusen', 'perf.jsonl');

if (!existsSync(path)) {
  console.error(`[perf-check] Not found: ${path}`);
  console.error('[perf-check] 実機で Ctrl+N を 5 回以上操作してから再実行してください。');
  process.exit(1);
}

const lines = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);

// run_id ごとにイベントをグルーピング
const runs = new Map();
for (const ln of lines) {
  let ev;
  try {
    ev = JSON.parse(ln);
  } catch {
    console.warn('[perf-check] JSON parse error (skip):', ln);
    continue;
  }
  if (!runs.has(ev.run_id)) runs.set(ev.run_id, {});
  runs.get(ev.run_id)[ev.event] = ev.elapsed_ms;
}

// T2_READY の elapsed_ms を収集
const t2s = [...runs.values()]
  .map((r) => r['T2_READY'])
  .filter((x) => x != null);

if (t2s.length < 5) {
  console.error(
    `[perf-check] Need >= 5 samples, got ${t2s.length}. 実機で Ctrl+N をあと ${5 - t2s.length} 回操作してください。`
  );
  process.exit(1);
}

t2s.sort((a, b) => a - b);
const median = t2s[Math.floor(t2s.length / 2)];
const min = t2s[0];
const max = t2s[t2s.length - 1];

console.log(`[perf-check] Samples: ${t2s.length}`);
console.log(`[perf-check] T2_READY — min: ${min}ms, median: ${median}ms, max: ${max}ms`);
console.log(`[perf-check] 閾値: 300ms`);

if (median <= 300) {
  console.log(`[perf-check] PASS: 中央値 ${median}ms ≤ 300ms`);
  process.exit(0);
} else {
  console.error(`[perf-check] FAIL: 中央値 ${median}ms > 300ms`);
  process.exit(1);
}
