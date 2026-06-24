"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

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

// No drawing-library dependency: each map click while in polygon mode pushes a
// vertex; double-click closes the ring. The shape is rendered with a native
// google.maps.Polygon created/updated inside effects (mirrors HeatLayer and
// RadiusTool — all google.maps access stays in effects, torn down on cleanup).
export default function PolygonTool({
  active,
  vertices,
  closed,
  onAddVertex,
  onClose,
  onAbort,
}: PolygonToolProps) {
  const map = useMap();
  const polyRef = useRef<google.maps.Polygon | null>(null);
  // Keep latest callbacks in refs so the click listener effect doesn't need to
  // re-bind (and lose the in-progress gesture) on every parent re-render.
  const cbRef = useRef({ onAddVertex, onClose, onAbort });
  cbRef.current = { onAddVertex, onClose, onAbort };

  // Map click / double-click listeners — only bound while drawing (active and
  // not yet closed). Double-click closes the ring; we suppress the map's zoom.
  useEffect(() => {
    if (!map || !active || closed) return;
    const onClick = (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      cbRef.current.onAddVertex([e.latLng.lng(), e.latLng.lat()]);
    };
    const onDbl = (e: google.maps.MapMouseEvent) => {
      // Stop the default zoom-in on double-click while drawing.
      const dom = e.domEvent as Event | undefined;
      dom?.preventDefault?.();
      dom?.stopPropagation?.();
      cbRef.current.onClose();
    };
    const wasDblZoom = map.get("disableDoubleClickZoom");
    map.setOptions({ disableDoubleClickZoom: true });
    const l1 = map.addListener("click", onClick);
    const l2 = map.addListener("dblclick", onDbl);
    return () => {
      l1.remove();
      l2.remove();
      map.setOptions({ disableDoubleClickZoom: !!wasDblZoom });
    };
  }, [map, active, closed]);

  // Draw / update the polygon (or open path) whenever vertices change.
  useEffect(() => {
    if (!map) return;
    if (!active || vertices.length === 0) {
      polyRef.current?.setMap(null);
      polyRef.current = null;
      return;
    }
    const path = vertices.map(([lng, lat]) => ({ lat, lng }));
    if (!polyRef.current) {
      polyRef.current = new google.maps.Polygon({
        strokeColor: "#111111",
        strokeWeight: 1.5,
        strokeOpacity: 0.9,
        fillColor: "#ee2233", // revpar.red
        fillOpacity: closed ? 0.1 : 0.05,
        clickable: false,
        map,
      });
    }
    const poly = polyRef.current;
    poly.setMap(map);
    poly.setOptions({ fillOpacity: closed ? 0.1 : 0.05 });
    poly.setPath(path);
    return () => {
      // Interim updates reuse the instance; full teardown is in the effect below.
    };
  }, [map, active, vertices, closed]);

  // Remove the polygon entirely on unmount.
  useEffect(() => {
    return () => {
      polyRef.current?.setMap(null);
      polyRef.current = null;
    };
  }, []);

  if (!active || closed) return null;

  const canClose = vertices.length >= 3;

  // Floating drawing hint, centered under the header.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[68px] z-30 flex justify-center print:hidden">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900/95 px-3 py-1.5 text-xs text-white shadow-card backdrop-blur">
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
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
