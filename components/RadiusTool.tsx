"use client";

import { useEffect, useState } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap, whenStyleReady } from "./MapCanvas";
import { circleRing, LatLng, RADIUS_STEPS, RadiusStep } from "@/lib/geo";

type RadiusToolProps = {
  active: boolean;
  center: LatLng | null;
  radius: RadiusStep;
  onRadiusChange: (r: RadiusStep) => void;
  onClear: () => void;
};

const SRC = "area-circle";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

// The circle is a GeoJSON source + fill/line layers on the MapLibre map, kept
// for the life of the component and emptied when there's nothing to show.
export default function RadiusTool({
  active,
  center,
  radius,
  onRadiusChange,
  onClear,
}: RadiusToolProps) {
  const map = useMap();
  // Pixel position of the circle center, for anchoring the floating stepper.
  const [pixel, setPixel] = useState<{ x: number; y: number } | null>(null);

  // Create the source + layers once (on top of the basemap/heatmap).
  useEffect(() => {
    if (!map) return;
    const cancel = whenStyleReady(map, () => {
      if (map.getSource(SRC)) return;
      map.addSource(SRC, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "area-circle-fill",
        type: "fill",
        source: SRC,
        paint: { "fill-color": "#ee2233", "fill-opacity": 0.08 }, // revpar.red
      });
      map.addLayer({
        id: "area-circle-line",
        type: "line",
        source: SRC,
        paint: {
          "line-color": "#111111",
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      });
    });
    return () => {
      cancel();
      try {
        if (map.getLayer("area-circle-line")) map.removeLayer("area-circle-line");
        if (map.getLayer("area-circle-fill")) map.removeLayer("area-circle-fill");
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* map already removed */
      }
    };
  }, [map]);

  // Draw / update the circle when a center + radius exist and the tool is on.
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => {
      const src = map.getSource(SRC) as GeoJSONSource | undefined;
      if (!src) return;
      if (!active || !center) {
        src.setData(EMPTY);
        return;
      }
      src.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [circleRing(center, radius)] },
      });
    });
  }, [map, active, center, radius]);

  // Track the screen position of the center so the stepper floats with it.
  useEffect(() => {
    if (!map || !active || !center) {
      setPixel(null);
      return;
    }
    let raf = 0;
    const draw = () => {
      const p = map.project([center.lng, center.lat]);
      setPixel({ x: p.x, y: p.y });
    };
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    map.on("move", update);
    map.on("resize", update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", update);
      map.off("resize", update);
    };
  }, [map, active, center]);

  if (!active || !center || !pixel) return null;

  // Floating radius stepper, anchored just above the circle center.
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: pixel.x, top: pixel.y }}
    >
      <div
        className="pointer-events-auto -translate-x-1/2 -translate-y-[calc(100%+14px)]
          rounded-full bg-white/95 px-1 py-1 shadow-card ring-1 ring-black/5 backdrop-blur"
      >
        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label="Search radius"
        >
          {RADIUS_STEPS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRadiusChange(r)}
              aria-pressed={r === radius}
              aria-label={`${r} mile radius`}
              className={`rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums transition ${
                r === radius
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {r}
              <span className="ml-0.5 text-[9px] font-normal opacity-70">mi</span>
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-gray-200" />
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear radius"
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              focusable={false}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
