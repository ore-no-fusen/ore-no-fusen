/**
 * フィードバック送信API (Route Handler)
 *
 * 責務:
 * - クライアントからのフィードバック受信
 * - Discord Webhookへの通知転送
 * - エラーハンドリングとレスポンス生成
 */

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type, content, contact, systemInfo, version } = body;

        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

        if (!webhookUrl) {
            return NextResponse.json(
                { error: 'Server configuration error (Missing Webhook URL)' },
                { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // Discordへの通知内容を作成
        // Embedsを使ってリッチに表示
        const embed = {
            title: `📨 新着フィードバック: ${type}`,
            color: type === 'bug' ? 0xff0000 : type === 'feature' ? 0x00ff00 : 0x0099ff,
            fields: [
                {
                    name: '内容',
                    value: content || '(なし)',
                },
                {
                    name: '連絡先',
                    value: contact || 'なし',
                    inline: true,
                },
                {
                    name: 'バージョン',
                    value: version || '不明',
                    inline: true,
                },
            ],
            footer: {
                text: `OS: ${systemInfo || 'Unknown'} | IP: ${req.headers.get('x-forwarded-for') || 'Unknown'}`,
            },
            timestamp: new Date().toISOString(),
        };

        const discordBody = {
            embeds: [embed],
        };

        // Discordへ送信
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(discordBody),
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.statusText}`);
        }

        return NextResponse.json(
            { success: true },
            { headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (error) {
        console.error('Feedback error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }
}

export async function OPTIONS(req: Request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
