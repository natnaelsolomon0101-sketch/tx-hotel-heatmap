"use client";

/**
 * Header button that triggers the printable Market Brief.
 * The brief itself lives in <PrintBrief> (a `hidden print:block` section
 * rendered by MapView). Clicking here just invokes the browser print dialog;
 * the @media print rules in globals.css swap the on-screen map for the brief.
 */
export default function BriefButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Print market brief"
      aria-label="Print market brief"
      className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 md:px-3"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="7" rx="1" />
      </svg>
      <span className="hidden sm:inline">Brief</span>
    </button>
  );
}
