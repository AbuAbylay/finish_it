// Shown for any address the app does not have, in place of the framework's bare 404.
import Link from "next/link";
import { notFoundCopy as c } from "@/lib/copy/pages";

export const metadata = { title: c.tabTitle };

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto flex min-h-dvh max-w-reading flex-col justify-center gap-4 px-4 py-16">
        <h1 className="text-h1 text-ink">{c.title}</h1>
        <p className="text-body text-ink-muted">{c.line}</p>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center self-start rounded-control bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover"
        >
          {c.back}
        </Link>
      </main>
    </div>
  );
}
