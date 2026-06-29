import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export const metadata: Metadata = {
  title: "Send Notes Between iPhone and Windows with Google Drive | FUSEN",
  description:
    "FUSEN helps you hand off small notes between iPhone and Windows through Google Drive, so ideas can move from mobile to desktop and back.",
  alternates: {
    canonical: `${SITE_URL}/use-cases/iphone-google-drive-notes`,
  },
  openGraph: {
    title: "Send Notes Between iPhone and Windows with Google Drive | FUSEN",
    description:
      "Use Google Drive handoff to move small notes between iPhone and Windows.",
    url: `${SITE_URL}/use-cases/iphone-google-drive-notes`,
    siteName: "FUSEN",
    type: "article",
  },
};

export default function IphoneGoogleDriveNotesPage() {
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
            Send small notes between iPhone and Windows
          </h1>
          <p className="text-lg leading-8 text-slate-700">
            FUSEN uses Google Drive handoff so small notes can move between your
            iPhone and Windows desktop without becoming a heavy sync workspace.
          </p>
        </div>

        <div className="space-y-4 text-base leading-8 text-slate-700">
          <h2 className="text-2xl font-black text-slate-950">
            For ideas that start away from the desk
          </h2>
          <p>
            Some useful thoughts happen outside the coding environment. FUSEN lets
            you capture them on iPhone and bring them back to your Windows desktop
            as visible notes when it is time to work.
          </p>
          <p>
            The goal is not to replace a full notes system. It is to keep small,
            timely pieces of context from disappearing.
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
