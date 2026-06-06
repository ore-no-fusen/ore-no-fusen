---
title: 000-I Intention Layer
outline: deep
---

# 000-I Intention Layer

<p class="lead-text">
AIエージェント時代の上位思想・プロダクト定義
</p>

<p class="version-info">
思想文書 v1.1 / 2026-06-06
</p>

## Thesis

Ore-no-Fusen is not just a sticky note app.

It is an Intention Layer for the AI agent era.

In the age of AI agents, the most important human asset is not only information. It is intention: what I noticed, what I care about, what I want to try next, what I must not forget, and what I may one day want to hand to another person or an AI.

This app exists to keep those intentions alive across time, devices, and contexts.

It starts as a small sticky note on a Windows PC. But its real role is larger. It lets a person capture a thought, land it somewhere visible, keep it under their own control, surface it at the right time, act on it, and then resolve it without leaving unnecessary debris behind.

`Capture -> Land -> Persist -> Surface -> Act -> Resolve`

This loop is the product.

The sticky note is the interface.

## Problem

AI agents are becoming powerful, but human intention is still fragile.

A thought may start on a desktop. A reminder may appear on an iPhone. A decision may be buried in a chat. A bug report may live in Discord. A file may remain in Google Drive after its purpose is gone. Each tool stores data, but none of them automatically protects the user's intention.

When intention is lost, AI cannot help well. It can generate output, but it may optimize the wrong thing. It can summarize, but it may miss why something mattered. It can act quickly, but it may act on stale context.

Ore-no-Fusen is designed around this gap.

It is a small personal system that helps the user keep intent before asking AI, before contacting a developer, before moving from PC to phone, and before returning from phone to PC.

## Current Evidence

The current implementation already follows this direction.

<p class="table-caption">表 3-1　Intention Layer と現行機能の対応</p>

| No | Layer | Current feature | Intention it protects |
|:---|:---|:---|:---|
| 1 | Capture | PC sticky notes, Ctrl+N, image paste, Siri send | Do not lose the moment of thought |
| 2 | Land | Markdown files, tags, search, context menu | Put the intention into a visible workspace |
| 3 | Persist | Local files, Google Drive relay, IndexedDB | Keep the intention across devices and time |
| 4 | Surface | iPhone push, unread marker, developer conversation board | Bring it back only when it matters |
| 5 | Act | iPhone-to-PC send, Discord reply ingest | Turn intention into the next action |
| 6 | Resolve | Temporary Drive file cleanup, read state, diagnostics | Remove leftovers after the intention is handled |

These are not separate features. They are one loop.

Every future feature should be evaluated by whether it strengthens this loop without taking control away from the user.

## System Model

Ore-no-Fusen is local-first.

The user's sticky note body, images, videos, Google Drive relay files, and device state belong to the user. They are not stored on the developer's server.

Google Drive is a user-owned relay.

Vercel is used only when a protected server-side function is necessary, such as OAuth token exchange, Discord reply ingest, or scheduled checks.

Discord is not a place where user content is exposed broadly. Developer communication is treated as a bounded support channel. Replies from the developer do not suddenly appear as sticky notes in the user's workspace. They are shown only in the settings screen, where the user chooses to look.

Errors should be prevented when the app can reasonably detect them.

When an error still happens, the app must tell the user what to do next in plain words. A message that only names an internal file or API is not enough.

## AI Phone Direction

The iPhone integration is not merely a mobile viewer.

It is the pocket side of the same intention loop.

The PC is where many thoughts are shaped. The iPhone is where thoughts are carried, remembered, and returned. Google Drive connects them without requiring the developer to own the user's data.

This matters because AI work will not live in one screen. A human may notice something while walking, send it from iPhone, refine it on PC, ask AI to help, and later review the result. The product should support that movement without making the user think about infrastructure.

The app should feel like a quiet partner that keeps the user's intent in reach.

## AI Partner Search

This document was written in English first because the idea is not only local.

Ore-no-Fusen may one day need to explain itself to people building the future of AI: founders, researchers, investors, product builders, and people like Elon Musk or others in that class of world-shaping builders. The exact person is not the point. The point is that the product should be able to say, clearly and simply, what it is trying to protect.

It is searching for the right partners in the AI age.

Not a partner who replaces the user.

Not an AI that absorbs every private thought.

But a partner who understands that the next era needs a human-owned intention layer: a small, durable place where thoughts can land before they become prompts, tasks, code, decisions, support conversations, or shared work.

Ore-no-Fusen is a sticky note app because sticky notes are humble.

It is an Intention Layer because the future needs a place for human intent to survive.

## AIエージェント時代の Intention Layer

俺の付箋は、単なる付箋アプリではない。

AIエージェント時代に、人間の意図を守るための「Intention Layer」である。

AIが強くなるほど大事になるのは、情報そのものだけではない。何に気づいたのか、何を大切にしているのか、次に何を試したいのか、何を忘れてはいけないのか、いつか誰かやAIに渡したい文脈は何か。そういう人間側の意図が大事になる。

俺の付箋は、その意図を時間・端末・作業文脈をまたいで失わないためにある。

最初はWindows PC上の小さな付箋に見える。しかし本当の役割は、考えを捕まえ、見える場所に置き、自分の管理下に保ち、必要なタイミングで表面化させ、行動につなげ、終わったら残骸を片付けることである。

`Capture -> Land -> Persist -> Surface -> Act -> Resolve`

この循環がプロダクトである。

付箋は、その入口である。

AI時代のパートナー探しとは、ユーザーを置き換えるAIを探すことではない。

ユーザーの個人的な思考をすべて吸い上げる仕組みを探すことでもない。

人間が自分の意図を失わず、必要なときだけAI・端末・開発者・未来の自分へ渡せること。そのための小さくて強い場所を、一緒に作れる相手を探すことである。

だからこの文書は英語を先に置く。

この思想は、日本語のアプリの中だけで閉じるものではない。Elon Muskのような未来を作る側の人、あるいはそれに近いAI時代のビルダーにも、何を守ろうとしているプロダクトなのかが伝わる必要がある。

000 は「なぜ作るか・何を作るか」を定義する。001以降は「どう作るか」を定義する。

000-I は、その前に「何者として作るか」を定義する。

---

## 改版履歴

<div class="history-table">
<p class="table-caption">表 7-1　改版履歴</p>

| No | 版 | 日付 | 内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-06-06 | 000-I Intention Layer を実体文書として新設。AIエージェント時代の「意図の置き場」としての上位思想、loop、設計原則を定義。 |
| 2 | 1.1 | 26-06-06 | 英語の思想文を主文として復元し、日本語訳を追加。AI時代のパートナー探しとしての役割を明記。 |

</div>
