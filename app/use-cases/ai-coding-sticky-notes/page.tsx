import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export const metadata: Metadata = {
  title: "Sticky Notes for AI Coding Tools | FUSEN",
  description:
    "FUSEN is a local-first sticky notes app for developers using AI coding tools. Keep prompts, file paths, decisions, and small bits of context close to your Windows desktop.",
  alternates: {
    canonical: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
  },
  openGraph: {
    title: "Sticky Notes for AI Coding Tools | FUSEN",
    description:
      "Capture the small bits of context that decide whether an AI coding session keeps moving.",
    url: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
    siteName: "FUSEN",
    type: "article",
  },
};

export default function AiCodingStickyNotesPage() {
  return (
    <main className="min-h-screen bg-[#faf6ee] text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <Link href="/landing" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          FUSEN
        </Link>

        <div className="space-y-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Use case
          </p>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">
            Sticky notes for developers using AI coding tools
          </h1>
          <p className="text-lg leading-8 text-slate-700">
            FUSEN keeps small pieces of coding context visible: prompts, file paths,
            TODOs, design decisions, release notes, and the next thing you do not
            want to lose while working with AI coding tools.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            "Keep current task context beside VS Code or Cursor",
            "Store prompts and decisions without opening a heavy workspace",
            "Pin small TODOs while an agent or coding assistant is working",
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
