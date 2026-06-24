"use client";

import { useEffect } from "react";

// App-level error boundary. Keeps a transient client-side exception (e.g. a
// WebGL/maplibre hiccup) from white-screening the whole page; the user can retry.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-panel bg-surface p-6 text-center shadow-lg ring-1 ring-border">
        <h1 className="text-display">
          Something went wrong rendering the map
        </h1>
        <p className="mt-2 text-meta text-muted-foreground">
          A client-side error occurred. This is usually transient.
        </p>
        <button
          type="button"
          onClick={reset}
          className="transition-base mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-hover"
        >
          Reload the map
        </button>
      </div>
    </div>
  );
}
