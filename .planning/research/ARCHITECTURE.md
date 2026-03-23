# Architecture Patterns — iPhone連携 (Hono + Web Push + Google Drive)

**Project:** 俺の付箋 v2.0
**Domain:** Desktop sticky note app adding iPhone lock-screen push via Vercel-hosted API
**Researched:** 2026-03-23
**Confidence:** HIGH (primary sources: project's own PLAN_web_iphone.md, docs/ARCHITECTURE_DESIGN_v1.1.md, source code)

---

## Recommended Architecture

```
[PC: Tauri/Rust]
  │  invoke('fusen_send_to_iphone', { path })
  │    → Rust reads note file (storage::read_note)
  │    → reqwest POST /api/v1/notes/push  { title, body, tags }
  ▼
[Vercel: Hono inside Next.js App Router]
  app/api/v1/[[...route]]/route.ts   ← Hono catch-all entry
  │
  ├─ POST /api/v1/subscribe          ← iPhone PWA calls this once
  │    → write fusen_push_config.json to Google Drive
  │
  ├─ POST /api/v1/notes/push         ← Rust calls this on "iPhoneに送る"
  │    → write fusen_note.json to Google Drive
  │    → read fusen_push_config.json from Google Drive
  │    → VAPID sign + AES-128-GCM encrypt (web-push npm package)
  │    → HTTPS POST to APNs endpoint from push subscription
  │
  └─ GET /api/v1/notes/latest        ← iPhone PWA calls after notification tap
       → read fusen_note.json from Google Drive
       → return JSON to PWA viewer
  ▼
[APNs]  →  [iPhone: Safari PWA installed to Home Screen]
              Service Worker (public/sw.js)
                push event → self.registration.showNotification(...)
                notificationclick → clients.openWindow('/viewer')
              /viewer page (app/viewer/page.tsx)
                fetch /api/v1/notes/latest → render note body

[Google Drive (BYOS)]
  fusen_push_config.json   ← subscription endpoint + VAPID keys, written by iPhone
  fusen_note.json          ← latest note content, written by Hono on each push
```

---

## Component Boundaries

### Existing — No Changes

| Component | Responsibility | Location |
|-----------|---------------|----------|
| Rust AppState | Single source of truth for all note state | `src-tauri/src/state.rs` |
| storage::read_note | Read .md file + parse frontmatter | `src-tauri/src/storage.rs` |
| lib.rs tauri commands | All `fusen_*` Tauri invoke handlers | `src-tauri/src/lib.rs` |
| useStickyNoteContextMenu.ts | Right-click menu builder | `app/hooks/useStickyNoteContextMenu.ts` |
| app/api/notes.ts | Tauri invoke wrappers (client-side only) | `app/api/notes.ts` |
| app/api/window.ts | Tauri window geometry helpers | `app/api/window.ts` |
| app/api/feedback.ts | Sentry/feedback helpers | `app/api/feedback.ts` |
| app/api/tags.ts | Tag invoke wrappers | `app/api/tags.ts` |

Note: `app/api/*.ts` files are NOT HTTP routes — they are TypeScript modules that wrap Tauri's `invoke()`. They do not conflict with the new Hono HTTP routes under `app/api/v1/`.

### New — Phase 1 (Hono + Push API)

| Component | Responsibility | Location |
|-----------|---------------|----------|
| Hono entry | Route all /api/v1/* requests | `app/api/v1/[[...route]]/route.ts` |
| subscribe handler | Accept Push Subscription, write to Drive | `app/api/v1/handlers/subscribe.ts` |
| push handler | Write note JSON to Drive + send APNs push | `app/api/v1/handlers/push.ts` |
| latest handler | Read note JSON from Drive, return to PWA | `app/api/v1/handlers/latest.ts` |
| Google Drive wrapper | Authenticated Drive file read/write | `lib/gdrive.ts` |
| web-push wrapper | VAPID keygen, sign, encrypt | `lib/webpush.ts` |

### New — Phase 2 (Rust command + PWA)

| Component | Responsibility | Location |
|-----------|---------------|----------|
| fusen_send_to_iphone | Rust: read note, POST to Hono | `src-tauri/src/lib.rs` (append) |
| reqwest dependency | HTTP client for Rust | `src-tauri/Cargo.toml` (append) |
| ctx_send_to_iphone | Enable existing menu item + add action | `app/hooks/useStickyNoteContextMenu.ts` (1-line change) |
| Service Worker | Push receive + showNotification | `public/sw.js` (new) |
| PWA manifest | Home screen install metadata | `public/manifest.json` (new) |
| Viewer page | Display latest note after notification tap | `app/viewer/page.tsx` (new) |

---

## Data Flow

### Hono Integration with Next.js App Router

Next.js App Router supports a catch-all route segment `[[...route]]` that handles any path under a prefix. Hono's `handle()` export maps directly to Next.js `GET`, `POST`, etc. named exports.

```typescript
// app/api/v1/[[...route]]/route.ts
import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { subscribeHandler } from '../handlers/subscribe'
import { pushHandler } from '../handlers/push'
import { latestHandler } from '../handlers/latest'

export const runtime = 'nodejs'  // NOT 'edge' — googleapis requires Node.js runtime

const app = new Hono().basePath('/api/v1')

app.post('/subscribe', subscribeHandler)
app.post('/notes/push', pushHandler)
app.get('/notes/latest', latestHandler)

export const GET = handle(app)
export const POST = handle(app)
```

The `basePath('/api/v1')` call is required so Hono's internal routing correctly strips the prefix. Without it, routes registered as `/subscribe` would not match the actual URL `/api/v1/subscribe`.

**Runtime constraint:** `googleapis` requires Node.js APIs (`fs`, `http2`) and cannot run in the Vercel Edge Runtime. `export const runtime = 'nodejs'` must be set explicitly.

**Conflict check with existing `app/api/*.ts` files:** None. The existing files (`notes.ts`, `window.ts`, `tags.ts`, `feedback.ts`) are plain TypeScript modules, not `route.ts` files. Next.js only treats `route.ts` as an HTTP route handler. There is zero conflict.

### PC → Hono → APNs data flow (step by step)

```
1. User right-clicks sticky note
   → useStickyNoteContextMenu.ts: ctx_send_to_iphone action fires
   → invoke('fusen_send_to_iphone', { path: selectedFile.path })

2. Rust: fusen_send_to_iphone (lib.rs, new command)
   → storage::read_note(path)  [already exists]
   → extract first line as title, full body, tags from NoteMeta
   → reqwest::Client::new()
       .post("https://ore-no-fusen.vercel.app/api/v1/notes/push")
       .json(&payload)
       .send().await
   → return Ok(()) or Err(message)

3. Hono: POST /api/v1/notes/push (push.ts handler)
   → write fusen_note.json to Google Drive (lib/gdrive.ts)
   → read fusen_push_config.json from Google Drive
     → if not found: return 200 { ok: false, reason: "no_subscription" }
   → webpush.sendNotification(subscription, notificationPayload)  (lib/webpush.ts)
     → internally: VAPID sign + AES-128-GCM encrypt + HTTPS POST to APNs endpoint
   → return 200 { ok: true }

4. APNs → iPhone
   → Service Worker push event fires
   → sw.js: self.registration.showNotification('俺の付箋', { body, data: { url: '/viewer' } })
   → Lock screen notification appears

5. User taps notification
   → notificationclick: clients.openWindow('/viewer')
   → app/viewer/page.tsx: fetch('/api/v1/notes/latest')
   → Hono: GET /api/v1/notes/latest → read fusen_note.json from Drive → return JSON
   → viewer renders note body
```

### iPhone → Hono subscription flow (one-time setup)

```
1. User opens https://ore-no-fusen.vercel.app on iPhone Safari
   → app/viewer/page.tsx detects no existing subscription
   → shows 4-step setup guide

2. User taps "Add to Home Screen" (Safari share sheet)
   → PWA installed, Service Worker registered

3. User taps "Allow notifications" in PWA
   → navigator.serviceWorker.ready
   → registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
   → Push Subscription object returned { endpoint, keys: { p256dh, auth } }

4. PWA: fetch POST /api/v1/subscribe with subscription JSON
   → Hono: subscribe.ts handler writes fusen_push_config.json to Google Drive
   → Done. PC can now push to this iPhone.
```

---

## Patterns to Follow

### Pattern 1: Hono handler as plain async function

Each handler is a standalone `async (c: Context) => Response` function, co-located with its logic. Do not use Hono's class-based patterns.

```typescript
// app/api/v1/handlers/push.ts
import type { Context } from 'hono'
import { writeFileToDrive, readFileFromDrive } from '../../../lib/gdrive'
import { sendWebPush } from '../../../lib/webpush'

export async function pushHandler(c: Context) {
  const { title, body, tags } = await c.req.json()
  await writeFileToDrive('fusen_note.json', { title, body, tags, sent_at: new Date().toISOString() })
  const config = await readFileFromDrive('fusen_push_config.json')
  if (!config) return c.json({ ok: false, reason: 'no_subscription' })
  await sendWebPush(config, { title: '俺の付箋', body: title, data: { url: '/viewer' } })
  return c.json({ ok: true })
}
```

### Pattern 2: Google Drive file access with service account or OAuth refresh token

The server (Vercel) accesses Drive using a stored OAuth refresh token (not a service account). This avoids sharing Drive with any Google account other than the owner.

```typescript
// lib/gdrive.ts — key shape
import { google } from 'googleapis'

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })
```

File operations: `drive.files.list` to find by name + `drive.files.update` / `drive.files.create` for write. `drive.files.get` with `alt: 'media'` for read.

### Pattern 3: reqwest in Rust — minimal, tokio-aware

Use `reqwest` with `rustls-tls` (avoids OpenSSL on Windows). The existing `tokio` dependency in Cargo.toml makes `reqwest`'s async runtime compatible.

```toml
# src-tauri/Cargo.toml addition
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
```

The `fusen_send_to_iphone` command is `async fn`, which Tauri's macro handles via the existing tokio runtime. No additional runtime setup needed.

### Pattern 4: Service Worker push event — keep minimal

`public/sw.js` needs only three event handlers: `install`, `activate`, `push`, `notificationclick`. It must NOT use ES module syntax (`import`) — service workers require classic script format or bundled output.

```javascript
// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || '俺の付箋', {
      body: data.body,
      icon: '/icons/128x128.png',
      data: { url: data.data?.url || '/viewer' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Edge Runtime for googleapis

**What:** Setting `export const runtime = 'edge'` on the Hono catch-all route.
**Why bad:** `googleapis` uses Node.js built-ins (`fs`, `http2`, `crypto`). Edge Runtime has none of these. The build will fail or runtime will error silently.
**Instead:** Always `export const runtime = 'nodejs'` in `app/api/v1/[[...route]]/route.ts`.

### Anti-Pattern 2: Calling web-push with APNs endpoint directly (without VAPID)

**What:** Constructing a raw HTTPS/2 POST to `api.push.apple.com` yourself.
**Why bad:** APNs push from Web Push subscriptions requires the RFC 8292 VAPID JWT header and RFC 8291 message encryption. `web-push` npm package handles both correctly.
**Instead:** Use `webpush.sendNotification(subscription, payload)` where `subscription` is the full object from `pushManager.subscribe()`.

### Anti-Pattern 3: Storing push subscription in Vercel env vars or server memory

**What:** Saving the iPhone's push subscription in a Vercel environment variable or in-process memory.
**Why bad:** Vercel functions are stateless and ephemeral. Memory is lost between invocations. Env vars cannot be updated at runtime.
**Instead:** Use Google Drive as the persistence layer (`fusen_push_config.json`). This is already the project's BYOS design decision.

### Anti-Pattern 4: Modifying existing app/api/*.ts files

**What:** Renaming or wrapping the existing `app/api/notes.ts`, `window.ts`, `tags.ts` into Hono.
**Why bad:** These files are client-side TypeScript modules wrapping `invoke()`. They have no HTTP surface. Touching them gains nothing and risks breaking Tauri invoke wiring.
**Instead:** Leave them unchanged. Hono lives exclusively under `app/api/v1/`.

### Anti-Pattern 5: next-pwa generating sw.js overwriting the custom one

**What:** `next-pwa` is already configured in `next.config.mjs` with `dest: "public"`. It generates a `sw.js` in `public/`.
**Why bad:** `next-pwa` will overwrite `public/sw.js` on every build, erasing the custom push event handler.
**Instead:** Configure `next-pwa` to use a different filename or extend the generated worker. Options:
  - Set `customWorkerSrc: 'service_worker'` and put custom logic in `worker/index.ts` (next-pwa merges this).
  - Or name the custom file `public/push-sw.js` and register it manually from the PWA viewer page, bypassing next-pwa's auto-register.

---

## Integration Points with Existing Codebase

### Modified files (minimal changes only)

| File | Change | Risk |
|------|--------|------|
| `src-tauri/Cargo.toml` | Add `reqwest = { version = "0.12", features = ["json", "rustls-tls"] }` | LOW — additive only |
| `src-tauri/src/lib.rs` | Append new `fusen_send_to_iphone` async command + register in `generate_handler![]` | LOW — additive only |
| `app/hooks/useStickyNoteContextMenu.ts` | Change `enabled: false` to `enabled: true` on `ctx_send_to_iphone` item; add `invoke('fusen_send_to_iphone', ...)` in action | LOW — already scaffolded |

### New files (no existing code touched)

| File | Description |
|------|-------------|
| `app/api/v1/[[...route]]/route.ts` | Hono entry point |
| `app/api/v1/handlers/subscribe.ts` | Subscribe endpoint |
| `app/api/v1/handlers/push.ts` | Push note endpoint |
| `app/api/v1/handlers/latest.ts` | Latest note read endpoint |
| `lib/gdrive.ts` | Google Drive API wrapper |
| `lib/webpush.ts` | VAPID / web-push wrapper |
| `public/sw.js` | Service Worker (see next-pwa conflict note above) |
| `public/manifest.json` | PWA manifest |
| `app/viewer/page.tsx` | Note viewer + setup guide |
| `.env.local` | Local secrets (never committed) |

---

## Build Order (Phase Dependencies)

```
Phase 1: Hono + Push API foundation (no Rust changes, no UI changes)
  Step 1.1  npm install hono web-push googleapis
  Step 1.2  lib/gdrive.ts — Drive wrapper with OAuth refresh token
  Step 1.3  lib/webpush.ts — VAPID keygen + sendNotification wrapper
  Step 1.4  app/api/v1/[[...route]]/route.ts — Hono entry (nodejs runtime)
  Step 1.5  app/api/v1/handlers/subscribe.ts
  Step 1.6  app/api/v1/handlers/push.ts
  Step 1.7  app/api/v1/handlers/latest.ts
  Step 1.8  .env.local + Vercel env vars
  Step 1.9  Verify: curl POST /api/v1/subscribe returns 200

Phase 2: iPhone PWA + Rust send command (depends on Phase 1 API being live)
  Step 2.1  public/manifest.json (no build blocker, can be done anytime)
  Step 2.2  public/sw.js (resolve next-pwa conflict first)
  Step 2.3  app/viewer/page.tsx — setup guide + note viewer
  Step 2.4  Cargo.toml: reqwest addition
  Step 2.5  lib.rs: fusen_send_to_iphone command
  Step 2.6  useStickyNoteContextMenu.ts: enable ctx_send_to_iphone
  Step 2.7  Verify: end-to-end on real iPhone

Ordering rationale:
- Phase 1 before Phase 2 because Rust command POSTs to the Hono endpoint.
  Testing Rust send without the API live means no observable result.
- lib/gdrive.ts before handlers because both push and subscribe handlers import it.
- lib/webpush.ts before push handler because push handler calls sendNotification.
- manifest.json before sw.js because browser shows install prompt only when manifest is valid.
- sw.js before viewer page because viewer page triggers subscription via Service Worker.
- Cargo.toml + lib.rs before useStickyNoteContextMenu.ts change because the menu action
  invokes the Rust command — enabling the menu item before the command exists would
  produce a runtime error visible to the user.
```

---

## Scalability Considerations

This is a single-user system (BYOS design). Scalability in the traditional sense is not a concern. The relevant operational constraints are:

| Concern | Current scope | Implication |
|---------|--------------|-------------|
| Google Drive API quota | 1000 requests/100s per user | Single user sends notes manually — nowhere near limit |
| Vercel function timeout | 10s on free tier | googleapis + web-push chain should complete in < 2s |
| APNs delivery guarantee | Best-effort; retries not automatic | No retry logic needed for v2.0; note is in Drive as fallback |
| Push subscription expiry | APNs endpoint can expire (rare) | User re-visits viewer page to re-subscribe; no auto-recovery needed for v2.0 |
| next-pwa sw.js conflict | Build-time overwrite risk | Must resolve before first Vercel deploy of Phase 2 |

---

## Sources

- `PLAN_web_iphone.md` — Project's own implementation plan (HIGH confidence, authored by maintainer)
- `docs/ARCHITECTURE_DESIGN_v1.1.md` — Architecture design doc v1.1 (HIGH confidence)
- `app/hooks/useStickyNoteContextMenu.ts` — Existing `ctx_send_to_iphone` stub (source code)
- `next.config.mjs` — Confirms `next-pwa` is active with `dest: "public"` (source code)
- `src-tauri/Cargo.toml` — Confirms `tokio` already present, no `reqwest` yet (source code)
- `package.json` — Confirms `hono`, `web-push`, `googleapis` not yet installed (source code)
