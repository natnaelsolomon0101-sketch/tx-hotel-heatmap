"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import { useMap, whenStyleReady } from "./MapCanvas";

export type Vertex = [number, number]; // [lng, lat]

type PolygonToolProps = {
  /** Drawing mode is on (rail button toggled). */
  active: boolean;
  /** Vertices collected so far, [lng, lat]. Owned by the parent. */
  vertices: Vertex[];
  /** True once the ring is closed and a selection exists. */
  closed: boolean;
  onAddVertex: (v: Vertex) => void;
  onClose: () => void;
  onAbort: () => void;
};

const SRC = "area-poly";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

// No drawing-library dependency: each map click while in polygon mode pushes a
// vertex; double-click closes the ring. The shape is a GeoJSON source with
// fill/line/vertex layers on the MapLibre map (mirrors RadiusTool).
export default function PolygonTool({
  active,
  vertices,
  closed,
  onAddVertex,
  onClose,
  onAbort,
}: PolygonToolProps) {
  const map = useMap();
  // Keep latest callbacks in refs so the click listener effect doesn't need to
  // re-bind (and lose the in-progress gesture) on every parent re-render.
  const cbRef = useRef({ onAddVertex, onClose, onAbort });
  cbRef.current = { onAddVertex, onClose, onAbort };

  // Create the source + layers once.
  useEffect(() => {
    if (!map) return;
    const cancel = whenStyleReady(map, () => {
      if (map.getSource(SRC)) return;
      map.addSource(SRC, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "area-poly-fill",
        type: "fill",
        source: SRC,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#ee2233", // revpar.red
          "fill-opacity": ["case", ["get", "closed"], 0.1, 0.05],
        },
      });
      map.addLayer({
        id: "area-poly-line",
        type: "line",
        source: SRC,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": "#111111",
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "area-poly-pts",
        type: "circle",
        source: SRC,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 3.5,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#111111",
          "circle-stroke-width": 1.5,
        },
      });
    });
    return () => {
      cancel();
      try {
        for (const id of ["area-poly-pts", "area-poly-line", "area-poly-fill"]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* map already removed */
      }
    };
  }, [map]);

  // Map click / double-click listeners — only bound while drawing (active and
  // not yet closed). Double-click closes the ring; we suppress the map's zoom.
  useEffect(() => {
    if (!map || !active || closed) return;
    const onClick = (e: MapMouseEvent) => {
      cbRef.current.onAddVertex([e.lngLat.lng, e.lngLat.lat]);
    };
    const onDbl = (e: MapMouseEvent) => {
      // Stop the default zoom-in on double-click while drawing.
      e.preventDefault();
      cbRef.current.onClose();
    };
    const wasDblZoom = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    map.on("click", onClick);
    map.on("dblclick", onDbl);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      if (wasDblZoom) map.doubleClickZoom.enable();
    };
  }, [map, active, closed]);

  // Draw / update the polygon (or open path) whenever vertices change.
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => {
      const src = map.getSource(SRC) as GeoJSONSource | undefined;
      if (!src) return;
      if (!active || vertices.length === 0) {
        src.setData(EMPTY);
        return;
      }
      const features: GeoJSON.Feature[] = [];
      if (vertices.length >= 3) {
        features.push({
          type: "Feature",
          properties: { closed },
          geometry: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
        });
      } else if (vertices.length === 2) {
        features.push({
          type: "Feature",
          properties: { closed },
          geometry: { type: "LineString", coordinates: vertices },
        });
      }
      // Vertex handles while drawing (hidden once the ring is closed).
      if (!closed) {
        for (const v of vertices) {
          features.push({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: v },
          });
        }
      }
      src.setData({ type: "FeatureCollection", features });
    });
  }, [map, active, vertices, closed]);

  if (!active || closed) return null;

  const canClose = vertices.length >= 3;

  // Floating drawing hint, centered under the header.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[68px] z-30 flex justify-center print:hidden">
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900/95 px-3 py-1.5 text-xs text-white shadow-card backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <span className="tabular-nums">
          {vertices.length === 0
            ? "Click the map to drop the first point"
            : `${vertices.length} ${
                vertices.length === 1 ? "point" : "points"
              }${canClose ? " · double-click or Enter to close" : " · add ≥3"}`}
        </span>
        {canClose && (
          <button
            type="button"
            onClick={() => cbRef.current.onClose()}
            className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-900 hover:bg-gray-100"
          >
            Close
          </button>
        )}
        <button
          type="button"
          onClick={() => cbRef.current.onAbort()}
          aria-label="Cancel drawing"
          className="flex h-5 w-5 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white"
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
  );
}
