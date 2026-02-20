/**
 * Vitest 設定ファイル
 *
 * 責務:
 * - 単体テスト (Unit Test) の実行設定
 * - テスト環境 (jsdom) の指定
 * - パスエイリアスの解決設定
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['app/**/*.test.ts', 'app/**/*.test.tsx', 'lib/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            exclude: [
                'node_modules/',
                'src-tauri/',
                'out/',
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.spec.ts',
                '**/*.spec.tsx',
                '**/test/**',
                '**/tests/**',
                '**/e2e/**',
                '**/*.config.*',
                '**/next-env.d.ts',
                '**/types/**',
            ],
            reportsDirectory: './coverage',
            thresholds: {
                // 初期段階では閾値を緩和（段階的に上げていく）
                lines: 30,
                functions: 30,
                branches: 20,
                statements: 30,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
