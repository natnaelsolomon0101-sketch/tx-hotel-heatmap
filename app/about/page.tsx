import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ABOUT_SECTIONS, ONE_LINE_CREDIT } from "@/lib/disclaimer";

export const metadata: Metadata = {
  title: `About the Data · ${APP_NAME}`,
  description:
    "How TX Hotel RevPAR Intelligence sources and derives its figures, and the disclaimers that apply.",
};

export default function AboutDataPage() {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <Link
          href="/"
          className="text-meta font-medium text-accent hover:opacity-80"
        >
          ← Back to the map
        </Link>

        <div className="label-overline mt-8 text-accent">{APP_NAME}</div>
        <h1 className="text-display mt-1 text-3xl font-bold tracking-tight text-foreground">
          About the Data
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {ONE_LINE_CREDIT}
        </p>

        <div className="mt-8 space-y-7">
          {ABOUT_SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-semibold text-foreground">
                {s.heading}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <Link
            href="/"
            className="transition-base inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-surface hover:opacity-90"
          >
            ← Back to the map
          </Link>
        </div>
      </div>
    </main>
  );
}
