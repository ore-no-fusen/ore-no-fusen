import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export const metadata: Metadata = {
  title: "Windows Sticky Notes App for Developers | FUSEN",
  description:
    "FUSEN is a fast Windows sticky notes app for developers. Keep notes on your desktop, search them, tag them, archive them, and stay in flow.",
  alternates: {
    canonical: `${SITE_URL}/use-cases/windows-sticky-notes`,
  },
  openGraph: {
    title: "Windows Sticky Notes App for Developers | FUSEN",
    description:
      "A lightweight local-first sticky notes app for Windows developer workflows.",
    url: `${SITE_URL}/use-cases/windows-sticky-notes`,
    siteName: "FUSEN",
    type: "article",
  },
};

export default function WindowsStickyNotesPage() {
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
            A Windows sticky notes app for developers
          </h1>
          <p className="text-lg leading-8 text-slate-700">
            FUSEN gives developers fast desktop notes for the small things that
            should stay visible: commands, file paths, tasks, links, and thoughts.
          </p>
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            Built to stay lightweight
          </h2>
          <p>
            Many notes tools become a place you have to manage. FUSEN is closer to
            a developer desk: small notes, visible context, local files, quick
            search, tags, archives, attachments, and automatic note arrangement.
          </p>
          <p>
            It is designed for Windows, with a simple install path and a workflow
            that stays near the coding environment.
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
