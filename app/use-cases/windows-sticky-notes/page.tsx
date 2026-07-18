import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ore-no-fusen.vercel.app";
const STORE_URL = "https://apps.microsoft.com/detail/9N4MW0V2MVVG";
const WINGET_COMMAND = "winget install --id 9N4MW0V2MVVG --source msstore";

export const metadata: Metadata = {
  title: "Windows Sticky Notes App with Markdown and winget | FUSEN",
  description:
    "FUSEN is a fast Windows sticky notes app for developers. It supports Markdown, local files, always-on-top desktop notes, tags, search, and winget install.",
  keywords: [
    "Windows sticky notes app",
    "winget sticky notes",
    "Markdown sticky notes Windows",
    "note app Windows",
    "developer notes app",
    "Windows 付箋 Markdown",
    "Windows 付箋 常に手前",
  ],
  alternates: {
    canonical: `${SITE_URL}/use-cases/windows-sticky-notes`,
  },
  openGraph: {
    title: "Windows Sticky Notes App with Markdown and winget | FUSEN",
    description:
      "A lightweight local-first sticky notes app for Windows developer workflows.",
    url: `${SITE_URL}/use-cases/windows-sticky-notes`,
    siteName: "FUSEN",
    type: "article",
  },
};

export default function WindowsStickyNotesPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FUSEN",
    alternateName: "Ore-no-Fusen",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Windows",
    url: `${SITE_URL}/use-cases/windows-sticky-notes`,
    installUrl: STORE_URL,
    description:
      "A Windows sticky notes app for developers with Markdown, local files, always-on-top notes, search, tags, and winget install.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
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
            A Windows sticky notes app with Markdown and winget install
          </h1>
          <p className="text-lg leading-8 text-slate-700">
            FUSEN gives developers fast desktop sticky notes for the small things
            that should stay visible: commands, file paths, tasks, links, and
            thoughts. It is a lightweight note app for Windows, with Markdown
            support and a simple winget install path.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 font-mono text-sm text-slate-800 shadow-sm">
          {WINGET_COMMAND}
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            Built to stay lightweight on Windows
          </h2>
          <p>
            Many notes tools become a place you have to manage. FUSEN is closer to
            a developer desk: small notes, visible context, local files, quick
            search, tags, archives, attachments, and automatic note arrangement.
          </p>
          <p>
            It is designed for Windows 10/11, with local-first Markdown files, an
            always-on-top workflow, and installation through Microsoft Store or
            the Store catalog exposed by winget.
          </p>
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            What makes it different from the built-in Sticky Notes app?
          </h2>
          <p>
            FUSEN is aimed at developer workflows: Markdown-style formatting,
            pasted images, tags, search, archive folders, keyboard shortcuts, and
            quick capture while coding. It is not a full project management tool;
            it is a small visible layer for context you do not want to lose.
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
