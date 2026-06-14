---
title: 008 配布設計（MSIX / MSI）
outline: deep
---

# 008 配布設計（MSIX / MSI）

<p class="lead-text">
MSIX お試し版と MSI 本気版の配布形態の違い、共有データ、制約を明文化します。
</p>

<p class="version-info">
配布設計 v1.0 / 2026-06-15
</p>

---

## 1 目的

本章では、Microsoft Store で配布する MSIX お試し版と、MSI/NSIS で配布する本気版の違いを定義します。
両版で共有されるデータ、実行時の切り替え、自動起動、自動更新、保存先とファイル運用の制約を明文化します。

<Note type="info">
本章は配布形態の設計を扱います。ソースコードは 1 つに保ち、実行時に `is_msix_packaged()` で挙動を切り替えます。
</Note>

---

## 2 配布形態

MSIX は Microsoft Store のお試し版として扱います。導入が楽で、更新は Store の自動更新に任せます。
MSI/NSIS は本気版として扱います。自由な保存先、高度なファイル運用、アプリ内更新を前提にします。

<p class="table-caption">表 2-1 MSIX / MSI 配布形態の比較</p>

| No | 項目 | MSIX | MSI/NSIS |
|:---|:---|:---|:---|
| 1 | 位置づけ | Microsoft Store のお試し版 | 本気版 |
| 2 | 導入 | Store 経由で導入しやすい | インストーラーで導入する |
| 3 | 更新 | Store 自動更新 | アプリ内更新（Tauri updater） |
| 4 | 保存先 | 制約がある | 自由な保存先を扱いやすい |
| 5 | 高度なファイル運用 | 非推奨 | 推奨 |
| 6 | 挙動切り替え | `is_msix_packaged()` で MSIX と判定する | `is_msix_packaged()` で MSIX ではないと判定する |

---

## 3 共通の前提

設定（`%APPDATA%`）と付箋（Documents）は、MSI 版と MSIX 版で共有されます。
MSIX は AppData を仮想化しないことを実測済みです。
そのため、お試し版も実データを使います。隔離サンドボックスではありません。

<Note type="warning">
MSI 版と MSIX 版は single-instance により同時起動できません。起動できるのは片方ずつです。
</Note>

---

## 4 自動起動

MSIX は manifest の StartupTask を使います。`Enabled=true` によりデフォルト常駐起動にし、設定トグルで ON/OFF します。
ただし、Windows のスタートアップ設定でオフにされた場合、アプリから再有効化できません。

MSI/desktop はレジストリ Run キーを使います。実装は `tauri-plugin-autostart` を使います。
MSIX ではレジストリ方式を使いません。仮想化により効かないためです。

<p class="table-caption">表 4-1 自動起動方式</p>

| No | 配布形態 | 方式 | 補足 |
|:---|:---|:---|:---|
| 1 | MSIX | manifest の StartupTask | `Enabled=true` でデフォルト常駐起動。設定トグルで ON/OFF する |
| 2 | MSI/desktop | レジストリ Run キー | `tauri-plugin-autostart` を使う |

---

## 5 自動更新

MSIX は Microsoft Store が自動更新します。
MSIX は読取専用のため自前更新はできません。
そのため、起動時の Tauri updater 自動チェックはスキップします。

MSI はアプリ内更新を使います。更新方式は Tauri updater です。

<p class="table-caption">表 5-1 自動更新方式</p>

| No | 配布形態 | 更新方式 | Tauri updater |
|:---|:---|:---|:---|
| 1 | MSIX | Microsoft Store 自動更新 | 起動時の自動チェックをスキップする |
| 2 | MSI | アプリ内更新 | Tauri updater を使う |

---

## 6 制約と割り切り

高度なファイル運用（symlink 等）は MSIX では非推奨です。
高度なファイル運用が必要な場合は MSI を推奨します。

保存先として、WindowsApps 配下や exe 配下などは使えません。
危険パス拒否は両版共通です。

開発者向け補足として、MSIX 識別子はダミーで開発し、Store 提出の最後に本物へ差し替えます。

<p class="table-caption">表 6-1 制約と割り切り</p>

| No | 項目 | 方針 |
|:---|:---|:---|
| 1 | 高度なファイル運用 | symlink 等は MSIX 非推奨。MSI 推奨 |
| 2 | 保存先 | WindowsApps 配下・exe 配下などは保存先にできない |
| 3 | 危険パス拒否 | 両版共通 |
| 4 | MSIX 識別子 | ダミーで開発し、Store 提出の最後に本物へ差し替える |

---

## 7 改版履歴

<div class="history-table">
<p class="table-caption">表 7-1 改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | v1.0 | 26-06-15 | 初版 |

</div>
