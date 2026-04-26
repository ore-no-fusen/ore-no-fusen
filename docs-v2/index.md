---
layout: doc
title: 俺の付箋 — 設計書ポータル
---

<style>
/* ===== DOC GRID ===== */
.doc-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  align-items: start;
  margin-top: 24px;
}
@media (max-width: 768px) {
  .doc-grid { grid-template-columns: 1fr; }
}

/* ===== DOC CARD ===== */
.doc-card {
  break-inside: avoid;
  margin-bottom: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}
html.dark .doc-card {
  background: #1e293b;
  border-color: #334155;
}

.doc-card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
html.dark .doc-card-header {
  border-bottom-color: #334155;
}

.doc-badge {
  display: inline-block;
  font-size: 11px; font-weight: 800;
  border-radius: 6px;
  padding: 3px 8px;
  white-space: nowrap;
  margin-top: 2px;
}
.badge-000 { background: #ede9fe; color: #4c1d95; }
.badge-001 { background: #dbeafe; color: #1e40af; }
.badge-002 { background: #dbeafe; color: #1e40af; }
.badge-003 { background: #dcfce7; color: #14532d; }
.badge-004 { background: #f3e8ff; color: #6b21a8; }
.badge-005 { background: #fee2e2; color: #991b1b; }
.badge-006 { background: #e0f2fe; color: #075985; }

.doc-card-title {
  flex: 1;
}
.doc-card-title a {
  font-size: 15px; font-weight: 700;
  text-decoration: none;
}
.doc-card-title a:hover { text-decoration: underline; }
.doc-subtitle {
  font-size: 12px; color: #64748b;
  margin-top: 4px;
}

/* ===== TOC LIST ===== */
.toc-list {
  padding: 16px 20px;
}
.toc-section {
  margin-bottom: 8px;
}
.toc-sec-link {
  display: block;
  font-size: 13px; font-weight: 700;
  text-decoration: none;
  margin-bottom: 4px;
}

/* ===== 読む順序ボックス ===== */
.read-order {
  background: #fefce8;
  border: 1.5px solid #fbbf24;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 32px;
  font-size: 13px;
  line-height: 1.8;
}
html.dark .read-order {
  background: #422006;
  border-color: #b45309;
}

.read-order strong { color: #92400e; }
html.dark .read-order strong { color: #fde68a; }

.read-order a { text-decoration: none; }
.read-order a:hover { text-decoration: underline; }
.read-order .note-text { color: #78350f; font-size: 12px; margin-top: 8px; }
html.dark .read-order .note-text { color: #fcd34d; }

.seq-badge {
  font-weight: 700;
  border-radius: 99px;
  padding: 2px 8px;
  margin-right: 4px;
  display: inline-block;
  font-size: 11px;
}
</style>

<div class="portal-header">
  <div style="display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: #6d28d9; background: #ede9fe; border-radius: 99px; padding: 3px 10px; margin-bottom: 10px;">DESIGN DOCS PORTAL</div>
  <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 6px; border: none;">俺の付箋 設計書</h1>
  <p style="font-size: 14px; color: #64748b;">000〜006 の全ドキュメント・全セクション一覧。各リンクから該当箇所へ直接ジャンプできます。</p>
</div>

---

## 設計書一覧

<p class="table-caption">表1　設計書一覧</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0;">
<table class="module-table">
  <tr><th>No.</th><th>タイトル</th><th>内容</th></tr>
  <tr><td><span class="doc-badge badge-000">000</span></td><td><strong><a href="./000_REQUIREMENTS">要求仕様</a></strong></td><td>プロダクトが満たすべき機能・非機能要件</td></tr>
  <tr><td><span class="doc-badge badge-001">001</span></td><td><strong><a href="./001_OVERVIEW">システム全体像</a></strong></td><td>登場人物・技術スタック・データフロー等</td></tr>
  <tr><td><span class="doc-badge badge-002">002</span></td><td><strong><a href="./002_PC">PCローカル・UI設計</a></strong></td><td>画面構成・モジュール・データ構造・フロー</td></tr>
  <tr><td><span class="doc-badge badge-003">003</span></td><td><strong><a href="./003_IPHONE">クラウド同期・iPhone設計</a></strong></td><td>画面構成・Service Worker・データ構造等</td></tr>
</table>
<table class="module-table">
  <tr><th>No.</th><th>タイトル</th><th>内容</th></tr>
  <tr><td><span class="doc-badge badge-004">004</span></td><td><strong><a href="./004_TEST">テスト設計</a></strong></td><td>テスト戦略・テスト対象・実行方法・領域等</td></tr>
  <tr><td><span class="doc-badge badge-005">005</span></td><td><strong><a href="./005_GLOSSARY">用語集</a></strong></td><td>専門用語・略語一覧</td></tr>
  <tr><td><span class="doc-badge badge-006">006</span></td><td><strong><a href="./006_ARCHITECTURE">4+1 Viewアーキテクチャ</a></strong></td><td>4+1 View Model・システム全体俯瞰図</td></tr>
</table>
</div>

---

<div class="read-order">
  <strong>📖 読む順序</strong>：<br>
  <a href="./000_REQUIREMENTS"><span class="seq-badge" style="background:#ede9fe;color:#4c1d95;">000</span>要求仕様</a> →
  <a href="./001_OVERVIEW"><span class="seq-badge" style="background:#dbeafe;color:#1e40af;">001</span>システム全体像</a> →
  <a href="./002_PC"><span class="seq-badge" style="background:#dbeafe;color:#1e40af;">002</span>PCローカル・UI設計</a> →
  <a href="./003_IPHONE"><span class="seq-badge" style="background:#dcfce7;color:#14532d;">003</span>クラウド同期・iPhone設計</a> →
  <a href="./004_TEST"><span class="seq-badge" style="background:#f3e8ff;color:#6b21a8;">004</span>テスト設計</a> →
  <a href="./005_GLOSSARY"><span class="seq-badge" style="background:#fee2e2;color:#991b1b;">005</span>用語集</a> →
  <a href="./006_ARCHITECTURE"><span class="seq-badge" style="background:#e0f2fe;color:#075985;">006</span>4+1 Viewアーキテクチャ</a>
  
  <div class="note-text">⚠️ <strong>000（要求仕様）</strong> は「なぜ作るか・何を作るか」を定義する文書です。<strong>001〜006（設計書）</strong> は「どう作るか」を定義する別の文書群です。初めて読む方は000から順に読むことを推奨します。</div>
</div>

---

<div class="doc-grid">
  <!-- ===== 000 ===== -->
  <div class="doc-card">
    <div class="doc-card-header">
      <span class="doc-badge badge-000">000</span>
      <div class="doc-card-title">
        <a href="./000_REQUIREMENTS">要求仕様</a>
        <div class="doc-subtitle">機能要件・非機能要件・USDM</div>
      </div>
    </div>
    <div class="toc-list">
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#1-全体概要">1 全体概要</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#2-ライフサイクル要件">2 ライフサイクル要件</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#3-データ管理要件">3 データ管理要件</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#4-編集-表示要件">4 編集・表示要件</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#5-検索-整理要件">5 検索・整理要件</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#6-ui-ux-仕様">6 UI/UX 仕様</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#7-インターフェース仕様">7 インターフェース仕様</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#8-非機能要件">8 非機能要件</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./000_REQUIREMENTS#9-iphone-連携要件">9 iPhone 連携要件</a></div>
    </div>
  </div>

  <!-- ===== 001 ===== -->
  <div class="doc-card">
    <div class="doc-card-header">
      <span class="doc-badge badge-001">001</span>
      <div class="doc-card-title">
        <a href="./001_OVERVIEW">システム全体像</a>
        <div class="doc-subtitle">登場人物・技術スタック・データフロー</div>
      </div>
    </div>
    <div class="toc-list">
      <div class="toc-section"><a class="toc-sec-link" href="./001_OVERVIEW#1-登場人物">1 登場人物</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./001_OVERVIEW#2-技術スタック">2 技術スタック</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./001_OVERVIEW#3-データフロー概要-3つのフロー">3 データフロー概要</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./001_OVERVIEW#4-なぜ-vercel-が必要か">4 なぜ Vercel が必要か</a></div>
    </div>
  </div>

  <!-- ===== 002 ===== -->
  <div class="doc-card">
    <div class="doc-card-header">
      <span class="doc-badge badge-002">002</span>
      <div class="doc-card-title">
        <a href="./002_PC">PCローカル・UI設計</a>
        <div class="doc-subtitle">画面構成・モジュール構造・データ構造</div>
      </div>
    </div>
    <div class="toc-list">
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#1-画面構成">1 画面構成</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#2-モジュール構造">2 モジュール構造</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#3-データ構造">3 データ構造</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#4-データフロー">4 データフロー</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#5-ui-インタラクション">5 UI インタラクション</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./002_PC#6-エラーハンドリング-リカバリ方針">6 エラーハンドリング・リカバリ方針</a></div>
    </div>
  </div>

  <!-- ===== 003 ===== -->
  <div class="doc-card">
    <div class="doc-card-header">
      <span class="doc-badge badge-003">003</span>
      <div class="doc-card-title">
        <a href="./003_IPHONE">クラウド同期・iPhone設計</a>
        <div class="doc-subtitle">Service Worker・データ構造・データフロー</div>
      </div>
    </div>
    <div class="toc-list">
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#1-画面構成">1 画面構成</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#2-モジュール構造">2 モジュール構造</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#3-データ構造">3 データ構造</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#4-データフロー">4 データフロー</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#5-ui-インタラクション">5 UI インタラクション</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./003_IPHONE#6-エラーハンドリング-リカバリ方針">6 エラーハンドリング・リカバリ方針</a></div>
    </div>
  </div>

  <!-- ===== 004 ===== -->
  <div class="doc-card">
    <div class="doc-card-header">
      <span class="doc-badge badge-004">004</span>
      <div class="doc-card-title">
        <a href="./004_TEST">テスト設計</a>
        <div class="doc-subtitle">テスト戦略・対象一覧・実行方法</div>
      </div>
    </div>
    <div class="toc-list">
      <div class="toc-section"><a class="toc-sec-link" href="./004_TEST#1-テスト戦略-ピラミッド">1 テスト戦略（ピラミッド）</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./004_TEST#2-ユニットテスト一覧-vitest">2 ユニットテスト一覧（Vitest）</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./004_TEST#3-e2eテスト一覧-playwright">3 E2Eテスト一覧（Playwright）</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./004_TEST#4-テスト実行方法">4 テスト実行方法</a></div>
      <div class="toc-section"><a class="toc-sec-link" href="./004_TEST#5-カバレッジ外の領域">5 カバレッジ外の領域</a></div>
    </div>
  </div>

  <!-- ===== 005 / 006 ===== -->
  <div style="display: flex; flex-direction: column; gap: 20px;">
    <div class="doc-card" style="margin-bottom: 0;">
      <div class="doc-card-header">
        <span class="doc-badge badge-005">005</span>
        <div class="doc-card-title">
          <a href="./005_GLOSSARY">用語集</a>
          <div class="doc-subtitle">専門用語・略語一覧</div>
        </div>
      </div>
    </div>
    <div class="doc-card" style="margin-bottom: 0;">
      <div class="doc-card-header">
        <span class="doc-badge badge-006">006</span>
        <div class="doc-card-title">
          <a href="./006_ARCHITECTURE">4+1 Viewアーキテクチャ</a>
          <div class="doc-subtitle">4+1 View Model・システム全体俯瞰図</div>
        </div>
      </div>
    </div>
  </div>
</div>
