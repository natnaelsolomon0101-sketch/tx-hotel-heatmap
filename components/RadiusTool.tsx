"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { LatLng, RADIUS_STEPS, RadiusStep } from "@/lib/geo";

type RadiusToolProps = {
  active: boolean;
  center: LatLng | null;
  radius: RadiusStep;
  onRadiusChange: (r: RadiusStep) => void;
  onClear: () => void;
};

// Mirrors HeatLayer's pattern: all google.maps access lives inside effects, the
// overlay object is created on mount of the effect and torn down on cleanup.
export default function RadiusTool({
  active,
  center,
  radius,
  onRadiusChange,
  onClear,
}: RadiusToolProps) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);
  // Pixel position of the circle center, for anchoring the floating stepper.
  const [pixel, setPixel] = useState<{ x: number; y: number } | null>(null);

  // Draw / update the circle when a center + radius exist and the tool is on.
  useEffect(() => {
    if (!map) return;
    if (!active || !center) {
      circleRef.current?.setMap(null);
      circleRef.current = null;
      return;
    }
    const radiusMeters = radius * 1609.344;
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        strokeColor: "#111111",
        strokeWeight: 1.5,
        strokeOpacity: 0.9,
        fillColor: "#ee2233", // revpar.red
        fillOpacity: 0.08,
        clickable: false,
        map,
      });
    }
    const c = circleRef.current;
    c.setMap(map);
    c.setCenter({ lat: center.lat, lng: center.lng });
    c.setRadius(radiusMeters);
    return () => {
      // Only fully tear down on unmount; interim updates reuse the instance.
    };
  }, [map, active, center, radius]);

  // Remove the circle entirely when the tool unmounts.
  useEffect(() => {
    return () => {
      circleRef.current?.setMap(null);
      circleRef.current = null;
    };
  }, []);

  // Track the screen position of the center so the stepper floats with it.
  useEffect(() => {
    if (!map || !active || !center) {
      setPixel(null);
      return;
    }
    let raf = 0;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.onRemove = () => {};
    overlay.draw = () => {
      const proj = overlay.getProjection();
      if (!proj) return;
      const p = proj.fromLatLngToContainerPixel(
        new google.maps.LatLng(center.lat, center.lng)
      );
      if (p) setPixel({ x: p.x, y: p.y });
    };
    overlay.setMap(map);
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => overlay.draw());
    };
    const l1 = map.addListener("bounds_changed", update);
    const l2 = map.addListener("idle", update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      l1.remove();
      l2.remove();
      overlay.setMap(null);
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
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
