"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import maplibregl, {
  Map as MlMap,
  StyleSpecification,
} from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";

// ---------------------------------------------------------------------------
// MapLibre basemap + one shared deck.gl overlay.
//
// Basemap tiles are Esri's free ArcGIS Online raster services (no key, no
// billing): World_Topo_Map by default, World_Imagery + the Boundaries & Places
// label overlay for satellite. The on-map attribution badge is off; the
// "Basemap: Esri" credit lives in the site footer instead.
//
// Children render inside the same positioned box as the map, so tool overlays
// (radius stepper, polygon hint) can position themselves in map-container
// pixels, exactly like the previous Google <Map> children did.
// ---------------------------------------------------------------------------

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export type BasemapId = "topo" | "satellite";

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "esri-topo": {
      type: "raster",
      tiles: [`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    "esri-imagery": {
      type: "raster",
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    "esri-labels": {
      type: "raster",
      tiles: [
        `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "basemap-bg",
      type: "background",
      paint: { "background-color": "#e9e6df" },
    },
    { id: "esri-topo", type: "raster", source: "esri-topo" },
    {
      id: "esri-imagery",
      type: "raster",
      source: "esri-imagery",
      layout: { visibility: "none" },
    },
    {
      id: "esri-labels",
      type: "raster",
      source: "esri-labels",
      layout: { visibility: "none" },
    },
  ],
};

/** Show the chosen basemap's raster layers and hide the others. */
export function setBasemap(map: MlMap, id: BasemapId) {
  const sat = id === "satellite";
  map.setLayoutProperty("esri-topo", "visibility", sat ? "none" : "visible");
  map.setLayoutProperty("esri-imagery", "visibility", sat ? "visible" : "none");
  map.setLayoutProperty("esri-labels", "visibility", sat ? "visible" : "none");
}

/** Run `fn` once the style can accept sources/layers (now, or after load). */
export function whenStyleReady(map: MlMap, fn: () => void): () => void {
  if (map.isStyleLoaded()) {
    fn();
    return () => {};
  }
  const run = () => fn();
  map.once("load", run);
  return () => {
    map.off("load", run);
  };
}

/** Ids of the area-tool layers (polygon + radius). Data layers that should sit
 *  beneath the drawn shapes insert themselves before the first that exists. */
export const AREA_LAYER_IDS = [
  "area-poly-fill",
  "area-poly-line",
  "area-poly-pts",
  "area-circle-fill",
  "area-circle-line",
];

export function firstAreaLayerId(map: MlMap): string | undefined {
  return AREA_LAYER_IDS.find((id) => map.getLayer(id));
}

type MapCtx = { map: MlMap; overlay: MapboxOverlay };
const Ctx = createContext<MapCtx | null>(null);

/** The MapLibre map, or null until it exists. */
export function useMap(): MlMap | null {
  return useContext(Ctx)?.map ?? null;
}

/** The shared deck.gl overlay drawn on top of the map, or null. */
export function useDeckOverlay(): MapboxOverlay | null {
  return useContext(Ctx)?.overlay ?? null;
}

export type MapClick = {
  lat: number;
  lng: number;
  /** True when the click landed on a pickable deck.gl object (pin/cluster). */
  picked: boolean;
};

type MapCanvasProps = {
  center: { lat: number; lng: number };
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  onClick?: (e: MapClick) => void;
  /** Map could not start (usually no WebGL). */
  onError?: (message: string) => void;
  children?: ReactNode;
};

export default function MapCanvas({
  center,
  zoom,
  minZoom,
  maxZoom,
  onClick,
  onError,
  children,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<MapCtx | null>(null);
  // Latest callbacks in refs: the map is created once and never re-bound.
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // Initial view only; later moves go through the map instance.
  const initial = useRef({ center, zoom, minZoom, maxZoom }).current;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLE,
        center: [initial.center.lng, initial.center.lat],
        zoom: initial.zoom,
        minZoom: initial.minZoom,
        maxZoom: initial.maxZoom,
        attributionControl: false,
        // One world, no repeated copies side by side. (A world-sized maxBounds
        // breaks MapLibre's transform at load, so it's deliberately not set.)
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (e) {
      console.error("Map failed to start", e);
      onErrorRef.current?.(
        "This browser could not start the map (WebGL unavailable)."
      );
      return;
    }
    // North-up only, like the previous roadmap.
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const canvas = map.getCanvas();
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      // The deck canvas ignores pointer events (MapLibre forwards them), so
      // set the hand cursor on the map canvas when hovering a pickable object.
      onHover: (info) => {
        canvas.style.cursor = info.picked ? "pointer" : "";
      },
    });
    map.addControl(overlay);

    map.on("click", (e) => {
      let picked = false;
      try {
        picked = !!overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 0 });
      } catch {
        picked = false;
      }
      onClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng, picked });
    });

    setCtx({ map, overlay });
    return () => {
      setCtx(null);
      map.remove();
    };
  }, [initial]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        aria-label="Map of Texas hotels"
      />
      {ctx && <Ctx.Provider value={ctx}>{children}</Ctx.Provider>}
    </div>
  );
}
