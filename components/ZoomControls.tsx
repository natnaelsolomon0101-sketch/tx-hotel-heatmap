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
    <div
      className="absolute z-20 flex flex-col items-center gap-2
        right-2 top-[68px]
        md:top-auto md:bottom-6 md:right-[21.5rem]"
    >
      <div className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-sm ring-1 ring-border">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-base hover:bg-muted hover:text-foreground"
        >
          <PlusIcon />
        </button>
        <div className="h-px w-full bg-border" />
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-base hover:bg-muted hover:text-foreground"
        >
          <MinusIcon />
        </button>
      </div>
      <button
        type="button"
        onClick={onResetNorth}
        aria-label="Reset bearing to north"
        title="Reset north"
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-muted-foreground shadow-sm ring-1 ring-border transition-base hover:bg-muted hover:text-foreground"
      >
        <span style={{ transform: `rotate(${-bearing}deg)` }} className="block">
          <CompassIcon />
        </span>
      </button>
    </div>
  );
}
