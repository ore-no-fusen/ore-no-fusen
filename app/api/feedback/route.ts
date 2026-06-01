/**
 * フィードバック送信API (Route Handler)
 *
 * 責務:
 * - クライアントからのフィードバック受信
 * - Discord Webhookへの通知転送
 * - エラーハンドリングとレスポンス生成
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSecretToken, hashSecretToken } from './lib/security';
import { createFeedbackConversationStore } from './lib/store';

// Static export (Tauri build) requires at least one GET handler per route.
// This endpoint is only functional on Vercel (server-side). In Tauri builds,
// the app calls https://ore-no-fusen.vercel.app/api/feedback instead.
export async function GET() {
    return NextResponse.json(
        { error: 'Method Not Allowed' },
        { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type, content, contact, systemInfo, version } = body;
        const conversationId = typeof body.conversationId === 'string' && body.conversationId.trim()
            ? body.conversationId.trim()
            : randomUUID();
        const secretToken = typeof body.secretToken === 'string' && body.secretToken.trim()
            ? body.secretToken.trim()
            : createSecretToken();
        const store = createFeedbackConversationStore();
        const now = new Date().toISOString();
        const recentMessages = await store.listLatestMessages(conversationId, 5);
        const recentContext = recentMessages.length === 0
            ? '過去のやりとりはまだありません。'
            : recentMessages
                .map((message) => `${message.authorType === 'developer' ? 'アプリ開発者' : 'ユーザー'}: ${message.body}`)
                .join('\n');

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
                {
                    name: '会話ID',
                    value: conversationId,
                },
                {
                    name: '直近5件',
                    value: recentContext.slice(0, 1000),
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
        const discordUrl = new URL(webhookUrl);
        discordUrl.searchParams.set('wait', 'true');

        const response = await fetch(discordUrl.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(discordBody),
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.statusText}`);
        }

        const discordMessage = await response.json().catch(() => null) as {
            id?: string;
            channel_id?: string;
        } | null;

        if (discordMessage?.id && discordMessage.channel_id) {
            await store.createConversation({
                conversationId,
                secretTokenHash: hashSecretToken(secretToken),
                discordChannelId: discordMessage.channel_id,
                discordMessageId: discordMessage.id,
                deliveryEnabled: true,
                shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
                createdAt: now,
                updatedAt: now,
            });
        }

        await store.appendMessage({
            messageId: randomUUID(),
            conversationId,
            authorType: 'user',
            body: content || '',
            createdAt: now,
            readByUser: true,
            shadowOnly: false,
        });

        return NextResponse.json(
            { success: true, conversationId, secretToken },
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
