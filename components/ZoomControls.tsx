"use client";

import { PlusIcon, MinusIcon, CompassIcon } from "./icons";

type ZoomControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNorth: () => void;
  bearing: number;
};

export default function ZoomControls({
  onZoomIn,
  onZoomOut,
  onResetNorth,
  bearing,
}: ZoomControlsProps) {
  return (
    <div className="absolute bottom-6 right-4 z-20 flex flex-col items-center gap-2">
      <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/5">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className="flex h-10 w-10 items-center justify-center text-gray-700 hover:bg-gray-100"
        >
          <PlusIcon />
        </button>
        <div className="h-px w-full bg-gray-200" />
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className="flex h-10 w-10 items-center justify-center text-gray-700 hover:bg-gray-100"
        >
          <MinusIcon />
        </button>
      </div>
      <button
        type="button"
        onClick={onResetNorth}
        aria-label="Reset bearing to north"
        title="Reset north"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-700 shadow-card ring-1 ring-black/5 hover:bg-gray-100"
      >
        <span style={{ transform: `rotate(${-bearing}deg)` }} className="block">
          <CompassIcon />
        </span>
      </button>
    </div>
  );
}
