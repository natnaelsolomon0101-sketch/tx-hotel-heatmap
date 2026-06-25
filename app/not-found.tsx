import Link from "next/link";

// App-level 404 page. Rendered when a route does not match (Server Component:
// a not-found view needs no client interactivity, just a way back to the map).
export default function NotFound() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-panel bg-surface p-6 text-center shadow-lg ring-1 ring-border">
        <h1 className="text-display">Page not found</h1>
        <p className="mt-2 text-meta text-muted-foreground">
          That link doesn&apos;t point to a view we can load. Head back to the
          Texas RevPAR map to start exploring.
        </p>
        <Link
          href="/"
          className="transition-base mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-hover"
        >
          Back to the map
        </Link>
      </div>
    </div>
  );
}
