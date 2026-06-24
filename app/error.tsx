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
    <div className="flex h-screen w-screen items-center justify-center bg-[#eceff1] p-8">
      <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold text-gray-900">
          Something went wrong rendering the map
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          A client-side error occurred. This is usually transient.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Reload the map
        </button>
      </div>
    </div>
  );
}
