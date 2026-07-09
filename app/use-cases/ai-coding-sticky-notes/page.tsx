import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export const metadata: Metadata = {
  title: "Sticky Notes for AI Coding, Cursor, Claude Code, and Codex | FUSEN",
  description:
    "FUSEN is a local-first sticky notes app for developers using AI coding tools such as Cursor, Claude Code, Codex, and Copilot. Keep prompts, file paths, decisions, and next actions visible on Windows.",
  keywords: [
    "sticky notes for AI coding",
    "Cursor notes app",
    "Claude Code notes",
    "Codex notes",
    "AI coding sticky notes",
    "developer notes app",
    "AIコーディング 付箋",
    "Cursor メモ アプリ",
  ],
  alternates: {
    canonical: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
  },
  openGraph: {
    title: "Sticky Notes for AI Coding, Cursor, Claude Code, and Codex | FUSEN",
    description:
      "Capture the small bits of context that decide whether an AI coding session keeps moving.",
    url: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
    siteName: "FUSEN",
    type: "article",
  },
};

export default function AiCodingStickyNotesPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Sticky Notes for AI Coding, Cursor, Claude Code, and Codex",
    description:
      "How FUSEN keeps prompts, file paths, decisions, TODOs, and next actions visible during AI coding work.",
    mainEntityOfPage: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
    author: {
      "@type": "Organization",
      name: "Ore-no-Fusen",
    },
  };

  return (
    <main className="min-h-screen bg-[#faf6ee] text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <Link href="/landing" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          FUSEN
        </Link>

        <div className="space-y-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Use case
          </p>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">
            Sticky notes for AI coding, Cursor, Claude Code, and Codex
          </h1>
          <p className="text-lg leading-8 text-slate-700">
            FUSEN keeps small pieces of coding context visible while you work with
            AI coding tools: prompts, file paths, TODOs, design decisions, release
            notes, and the next thing you do not want to lose while an agent is
            running.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            "Keep current task context beside VS Code, Cursor, or Windsurf",
            "Store prompts and decisions while Claude Code, Codex, or Copilot works",
            "Pin small TODOs while an AI coding assistant is running",
            "Send notes to/from iPhone with Google Drive handoff",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-white/70 p-5 text-slate-800 shadow-sm">
              {item}
            </div>
          ))}
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            Why a sticky notes app matters for AI coding
          </h2>
          <p>
            AI coding sessions often move quickly. The fragile part is not the
            final code, but the small context in the middle: what you asked, why
            a file matters, what you should check next, and which idea should not
            disappear. FUSEN is built for that layer.
          </p>
          <p>
            It is local-first, fast, and designed to stay close to your workflow
            without becoming another project management system.
          </p>
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            Use it as a small context board for AI coding
          </h2>
          <p>
            When a coding agent is editing files, you still need a place for the
            human layer: the test you must run next, the command you copied, the
            file path you are comparing, or the constraint you do not want the AI
            to forget. FUSEN keeps those notes visible on the Windows desktop.
          </p>
        </div>

        <Link
          href="/landing"
          className="inline-flex w-fit rounded-md bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
        >
          See FUSEN
        </Link>
      </section>
    </main>
  );
}
