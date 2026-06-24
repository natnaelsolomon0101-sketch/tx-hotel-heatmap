"use client";

import {
  LocationIcon,
  PolygonIcon,
  RadiusIcon,
  LayersIcon,
  MapTypeIcon,
} from "./icons";

export type LayerMode = "pins" | "heatmap";

type ToolRailProps = {
  layerMode: LayerMode;
  mapTypeLabel: string;
  onLocate: () => void;
  onToggleLayers: () => void;
  onCycleMapType: () => void;
  onPolygon: () => void;
  onRadius: () => void;
  polygonActive?: boolean;
  radiusActive?: boolean;
};

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition-base
        ${
          active
            ? "bg-ink text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
    >
      {children}
      <span
        className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-md
          bg-ink px-2 py-1 text-meta text-white shadow-sm transition-base group-hover:block"
      >
        {label}
      </span>
    </button>
  );
}

export default function ToolRail({
  layerMode,
  mapTypeLabel,
  onLocate,
  onToggleLayers,
  onCycleMapType,
  onPolygon,
  onRadius,
  polygonActive,
  radiusActive,
}: ToolRailProps) {
  return (
    <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2 md:left-4">
      <div className="flex flex-col items-center gap-1 rounded-lg bg-surface p-1.5 shadow-sm ring-1 ring-border backdrop-blur">
        <RailButton label="Recenter on Texas" onClick={onLocate}>
          <LocationIcon />
        </RailButton>
        <RailButton
          label={
            polygonActive ? "Drawing polygon — Esc to cancel" : "Draw polygon"
          }
          active={polygonActive}
          onClick={onPolygon}
        >
          <PolygonIcon />
        </RailButton>
        <RailButton
          label={
            radiusActive ? "Radius search — click map to place" : "Radius search"
          }
          active={radiusActive}
          onClick={onRadius}
        >
          <RadiusIcon />
        </RailButton>
        <div className="my-0.5 h-px w-7 bg-border" />
        <RailButton
          label={
            layerMode === "heatmap"
              ? "Layers: showing RevPAR heatmap"
              : "Layers: showing colored pins"
          }
          active={layerMode === "heatmap"}
          onClick={onToggleLayers}
        >
          <LayersIcon />
        </RailButton>
        <RailButton label={`Map type: ${mapTypeLabel}`} onClick={onCycleMapType}>
          <MapTypeIcon />
        </RailButton>
      </div>
    </div>
  );
}
