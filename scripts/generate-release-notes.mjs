#!/usr/bin/env node
/**
 * リリースノート自動生成スクリプト
 *
 * 責務:
 * - 前回タグ（または最初のコミット）以降のコミット履歴を git log から取得
 * - コミットメッセージの prefix (feat:, fix:, security: 等) で分類
 * - Markdown 形式で日英併記のリリースノートを stdout に出力
 *
 * 呼び出し: .github/workflows/release.yml の "Generate release notes" Step
 *
 * 出力例:
 *   ## v3.4.1
 *
 *   ### ✨ 新機能 / New Features
 *   - 設定画面に「使い方」タブを追加 (8d9bce9)
 *
 *   ### 🔒 セキュリティ / Security
 *   - /api/siri-send を POST 化 (250aa2c)
 *
 *   **Full Changelog**: https://github.com/.../compare/v3.4.0...v3.4.1
 */

import { execSync } from 'node:child_process';

/** prefix → { 絵文字, 日本語, 英語 } のマッピング */
const CATEGORIES = {
  feat: { emoji: '✨', ja: '新機能', en: 'New Features' },
  fix: { emoji: '🐛', ja: '修正', en: 'Bug Fixes' },
  security: { emoji: '🔒', ja: 'セキュリティ', en: 'Security' },
  perf: { emoji: '⚡', ja: 'パフォーマンス', en: 'Performance' },
  refactor: { emoji: '♻️', ja: 'リファクタ', en: 'Refactor' },
  docs: { emoji: '📝', ja: 'ドキュメント', en: 'Documentation' },
  test: { emoji: '🧪', ja: 'テスト', en: 'Tests' },
  chore: { emoji: '🔧', ja: 'その他', en: 'Chore' },
};

/** カテゴリ表示順 */
const CATEGORY_ORDER = ['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'test', 'chore'];

/** 「prefix なし or 未定義 prefix」のフォールバック */
const FALLBACK = { emoji: '📦', ja: 'その他', en: 'Other' };

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

/** 現在のタグ名（例: v3.4.1）。GITHUB_REF_NAME があればそれを使う */
function currentTag() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  return sh('git describe --tags --abbrev=0');
}

/** 1つ前のタグ名。無ければ null */
function previousTag(current) {
  // Windows の cmd では ^ がエスケープ文字なので ~1 を使う（^ と等価で全 OS 安全）
  try {
    return sh(`git describe --tags --abbrev=0 ${current}~1`);
  } catch {
    return null;
  }
}

/** 前回タグ..現タグの範囲のコミットを取得 */
function commitsBetween(from, to) {
  const range = from ? `${from}..${to}` : to;
  const raw = sh(`git log ${range} --no-merges --pretty=format:%H%x09%s`);
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [hash, subject] = line.split('\t');
    return { hash: hash.slice(0, 7), subject };
  });
}

/** "feat: xxx" → { prefix: 'feat', message: 'xxx' } */
function parseCommit(subject) {
  const match = subject.match(/^(\w+)(?:\([^)]+\))?!?:\s*(.+)$/);
  if (!match) return { prefix: null, message: subject };
  return { prefix: match[1].toLowerCase(), message: match[2] };
}

function buildNotes(tag, prevTag, commits) {
  // prefix ごとにグループ化
  const groups = {};
  for (const c of commits) {
    const { prefix, message } = parseCommit(c.subject);
    const key = CATEGORIES[prefix] ? prefix : '_fallback';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...c, message });
  }

  const lines = [];
  lines.push(`## ${tag}`);
  lines.push('');

  // 既知カテゴリを順番に出力
  for (const key of CATEGORY_ORDER) {
    if (!groups[key] || groups[key].length === 0) continue;
    const cat = CATEGORIES[key];
    lines.push(`### ${cat.emoji} ${cat.ja} / ${cat.en}`);
    for (const c of groups[key]) {
      lines.push(`- ${c.message} (${c.hash})`);
    }
    lines.push('');
  }

  // 未分類（fallback）を末尾に出力
  if (groups._fallback && groups._fallback.length > 0) {
    lines.push(`### ${FALLBACK.emoji} ${FALLBACK.ja} / ${FALLBACK.en}`);
    for (const c of groups._fallback) {
      lines.push(`- ${c.message} (${c.hash})`);
    }
    lines.push('');
  }

  // Full Changelog リンク
  const repo = process.env.GITHUB_REPOSITORY || 'ore-no-fusen/ore-no-fusen';
  if (prevTag) {
    lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${prevTag}...${tag}`);
  } else {
    lines.push(`**Full Changelog**: https://github.com/${repo}/commits/${tag}`);
  }

  return lines.join('\n');
}

function main() {
  const tag = currentTag();
  const prev = previousTag(tag);
  const commits = commitsBetween(prev, tag);

  if (commits.length === 0) {
    // コミットが取れない場合の最小フォールバック（ジョブを止めない）
    process.stdout.write(`## ${tag}\n\nNo commits found in range.\n`);
    return;
  }

  process.stdout.write(buildNotes(tag, prev, commits));
}

main();
