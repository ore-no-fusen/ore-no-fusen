/**
 * ErrorBoundary - Reactエラー境界コンポーネント
 *
 * 責務:
 * - 子コンポーネントで予期しない例外が発生した場合に白画面を防ぐ
 * - エラー内容を表示し、再試行ボタンで復帰できるようにする
 */

'use client';

import React from 'react';
import type { Language } from '@/lib/i18n';

type Props = {
    children: React.ReactNode;
    /** エラー発生時に代わりに表示するUI（省略時はデフォルトUIを使用）*/
    fallback?: React.ReactNode;
    language?: Language;
};

type State = {
    hasError: boolean;
    error: Error | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // エラーログ（Sentryが設定されていれば自動でも送られるが念のため）
        console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        // カスタムfallbackが指定されていればそちらを使う
        if (this.props.fallback) {
            return this.props.fallback;
        }

        // デフォルトのエラーUI
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: '80px',
                padding: '16px',
                gap: '8px',
                backgroundColor: 'rgba(254, 242, 242, 0.9)',
                borderRadius: '6px',
            }}>
                <div style={{ fontSize: '20px' }}>⚠️</div>
                <p style={{
                    fontSize: '12px',
                    color: '#991b1b',
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: 1.5,
                }}>
                    {this.props.language === 'en' ? 'An error occurred while displaying this screen.' : '表示中にエラーが発生しました'}
                </p>
                <button
                    onClick={this.handleReset}
                    style={{
                        marginTop: '4px',
                        padding: '4px 12px',
                        fontSize: '11px',
                        color: '#ffffff',
                        backgroundColor: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                    }}
                >
                    {this.props.language === 'en' ? 'Try Again' : '再試行'}
                </button>
            </div>
        );
    }
}
