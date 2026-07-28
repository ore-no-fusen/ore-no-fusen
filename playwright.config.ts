/**
 * Playwright 設定ファイル
 *
 * 責務:
 * - E2Eテスト (End-to-End) の実行設定
 * - ブラウザ設定、タイムアウト、並列実行の制御
 * - テスト用Webサーバーの起動設定
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
