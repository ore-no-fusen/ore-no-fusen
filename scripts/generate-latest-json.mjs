/**
 * リリース後に latest.json を生成するスクリプト
 *
 * 使い方:
 *   node scripts/generate-latest-json.mjs
 *
 * 必要な環境変数:
 *   TAURI_SIGNING_PRIVATE_KEY  - 秘密鍵のパス or 内容
 *
 * 実行後:
 *   latest.json が生成されるので GitHub Release にアップロードする
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// バージョンを package.json から読む
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = pkg.version;

// インストーラーパス
const installerPath = `./src-tauri/target/release/bundle/nsis/ore-no-fusen_${version}_x64-setup.exe`;
const sigPath = `${installerPath}.sig`;

if (!existsSync(installerPath)) {
    console.error(`エラー: インストーラーが見つかりません: ${installerPath}`);
    console.error('先に npm run tauri build を実行してください。');
    process.exit(1);
}

// 署名ファイルを生成（なければ）
if (!existsSync(sigPath)) {
    const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY || `${process.env.USERPROFILE}\\.tauri\\ore-no-fusen.key`;
    console.log(`署名を生成中... (鍵: ${keyPath})`);
    execSync(
        `npm run tauri -- signer sign -k "${keyPath}" "${resolve(installerPath)}"`,
        { stdio: 'inherit' }
    );
}

// 署名を読む
const signature = readFileSync(sigPath, 'utf-8').trim();

// 今日の日付
const pubDate = new Date().toISOString();

// ダウンロードURL
const downloadUrl = `https://github.com/ore-no-fusen/ore-no-fusen/releases/download/v${version}/ore-no-fusen_${version}_x64-setup.exe`;

const latestJson = {
    version: `v${version}`,
    notes: `俺の付箋 v${version} をリリースしました。`,
    pub_date: pubDate,
    platforms: {
        "windows-x86_64": {
            signature,
            url: downloadUrl
        }
    }
};

writeFileSync('./latest.json', JSON.stringify(latestJson, null, 2), 'utf-8');
console.log(`✅ latest.json を生成しました (v${version})`);
console.log(`   → GitHub Release に latest.json をアップロードしてください`);
console.log(`   → URL: https://github.com/ore-no-fusen/ore-no-fusen/releases/tag/v${version}`);
