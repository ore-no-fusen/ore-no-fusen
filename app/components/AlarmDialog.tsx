'use client';

import React, { useState, useEffect } from 'react';
import { TranslationKey } from '@/lib/i18n';

type AlarmDialogProps = {
    isOpen: boolean;
    existingAlarmAt: string | null;
    existingAlarmSound: boolean;
    onConfirm: (alarmAt: string, alarmSound: boolean) => void;
    onClear: () => void;
    onCancel: () => void;
    t: (key: TranslationKey) => string;
};

const RELATIVE_BUTTONS = [
    { label: '5分後',   en: 'In 5 min',   ms: 5 * 60 * 1000 },
    { label: '10分後',  en: 'In 10 min',  ms: 10 * 60 * 1000 },
    { label: '15分後',  en: 'In 15 min',  ms: 15 * 60 * 1000 },
    { label: '30分後',  en: 'In 30 min',  ms: 30 * 60 * 1000 },
    { label: '1時間後', en: 'In 1 hour',  ms: 60 * 60 * 1000 },
    { label: '2時間後', en: 'In 2 hours', ms: 2 * 60 * 60 * 1000 },
    { label: '1日後',   en: 'In 1 day',   ms: 24 * 60 * 60 * 1000 },
    { label: '3日後',   en: 'In 3 days',  ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '1週間後', en: 'In 1 week',  ms: 7 * 24 * 60 * 60 * 1000 },
];

export default function AlarmDialog({
    isOpen,
    existingAlarmAt,
    existingAlarmSound,
    onConfirm,
    onClear,
    onCancel,
    t,
}: AlarmDialogProps) {
    const [activeTab, setActiveTab] = useState<'relative' | 'absolute'>('relative');
    const [soundEnabled, setSoundEnabled] = useState(existingAlarmSound !== false);
    const [datetimeValue, setDatetimeValue] = useState('');

    // ダイアログが開くたびに現在時刻にリセット
    useEffect(() => {
        if (!isOpen) return;
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        setDatetimeValue(
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
        );
    }, [isOpen]);

    if (!isOpen) return null;

    // JST (+09:00) 形式でISO文字列を生成
    const toJSTString = (date: Date): string => {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        return jst.toISOString().slice(0, 19) + '+09:00';
    };

    const handleRelativeClick = (ms: number) => {
        const at = toJSTString(new Date(Date.now() + ms));
        onConfirm(at, soundEnabled);
    };

    const handleAbsoluteSet = () => {
        if (!datetimeValue) return;
        const at = toJSTString(new Date(datetimeValue));
        onConfirm(at, soundEnabled);
    };

    const formatExisting = (iso: string) => {
        try {
            const d = new Date(iso);
            return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return iso;
        }
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '6px 0',
        fontSize: '0.8rem',
        fontWeight: active ? 700 : 400,
        color: active ? '#b45309' : '#6b7280',
        backgroundColor: active ? '#fef3c7' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #b45309' : '2px solid transparent',
        cursor: 'pointer',
    });

    const relBtnStyle: React.CSSProperties = {
        padding: '8px 4px',
        fontSize: '0.8rem',
        color: '#374151',
        backgroundColor: '#f9fafb',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        cursor: 'pointer',
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
                width: '100%',
                maxWidth: '22rem',
                padding: '20px',
            }}>
                {/* タイトル */}
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>
                    {t('alarm.setTitle')}
                </h3>

                {/* 既存アラーム表示 */}
                {existingAlarmAt && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#fef3c7',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        marginBottom: '12px',
                        fontSize: '0.8rem',
                        color: '#92400e',
                    }}>
                        <span>⏰ {t('alarm.current')}{formatExisting(existingAlarmAt)}</span>
                        <button
                            onClick={onClear}
                            style={{
                                marginLeft: '8px',
                                padding: '3px 10px',
                                fontSize: '0.75rem',
                                color: '#dc2626',
                                backgroundColor: '#fff',
                                border: '1px solid #dc2626',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            {t('alarm.clear')}
                        </button>
                    </div>
                )}

                {/* タブ */}
                <div style={{ display: 'flex', marginBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                    <button style={tabStyle(activeTab === 'relative')} onClick={() => setActiveTab('relative')}>
                        {t('alarm.relative')}
                    </button>
                    <button style={tabStyle(activeTab === 'absolute')} onClick={() => setActiveTab('absolute')}>
                        {t('alarm.absolute')}
                    </button>
                </div>

                {/* 相対タブ */}
                {activeTab === 'relative' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                        {RELATIVE_BUTTONS.map((btn) => (
                            <button
                                key={btn.ms}
                                style={relBtnStyle}
                                onClick={() => handleRelativeClick(btn.ms)}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* 絶対タブ */}
                {activeTab === 'absolute' && (
                    <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                            type="datetime-local"
                            value={datetimeValue}
                            onChange={(e) => setDatetimeValue(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '0.875rem',
                                color: '#374151',
                                boxSizing: 'border-box',
                            }}
                        />
                        <button
                            onClick={handleAbsoluteSet}
                            disabled={!datetimeValue}
                            style={{
                                padding: '8px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: '#fff',
                                backgroundColor: datetimeValue ? '#d97706' : '#d1d5db',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: datetimeValue ? 'pointer' : 'default',
                            }}
                        >
                            {t('alarm.set')}
                        </button>
                    </div>
                )}

                {/* 通知音チェックボックス */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#374151', marginBottom: '16px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={(e) => setSoundEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    {t('alarm.sound')}
                </label>

                {/* キャンセル */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            fontSize: '0.875rem',
                            color: '#374151',
                            backgroundColor: '#f3f4f6',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
}
