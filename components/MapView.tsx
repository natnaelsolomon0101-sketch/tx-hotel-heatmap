"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

import {
  Bucket,
  HotelCollection,
  HotelHistory,
  HotelFeature,
} from "@/lib/types";
import ToolRail, { LayerMode } from "./ToolRail";
import ZoomControls from "./ZoomControls";
import LegendFilter from "./LegendFilter";
import PropertyCard from "./PropertyCard";
import PropertyList, { featureKey, SortKey } from "./PropertyList";
import HeaderBar from "./HeaderBar";
import { computeStats } from "@/lib/stats";
import { buildRevparIndex, getHotelPercentiles } from "@/lib/percentile";
import MarketPanel from "./MarketPanel";
import { aggregateMarkets } from "@/lib/markets";
import RangeFilters, { Range } from "./RangeFilters";
import { decodeState, useUrlState, UrlState } from "@/lib/urlState";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useMediaQuery } from "@/lib/useMediaQuery";
import ShortcutsHelp from "./ShortcutsHelp";
import BriefButton from "./BriefButton";
import PrintBrief from "./PrintBrief";
import Coachmark from "./Coachmark";
import CompareTray from "./CompareTray";
import PolygonTool, { Vertex } from "./PolygonTool";
import RadiusTool from "./RadiusTool";
import AreaSummary from "./AreaSummary";
import AnalyticsPanel from "./AnalyticsPanel";
import WatchlistView from "./WatchlistView";
import ShareButton from "./ShareButton";
import { useWatchlist } from "@/lib/useWatchlist";
import RollupPanel from "./RollupPanel";
import { aggregateRollup, RollupDim } from "@/lib/rollups";
import BrandFilter from "./BrandFilter";
import FilterPresets from "./FilterPresets";
import {
  FilterPreset,
  loadPresets,
  savePresets,
  loadRecentSearches,
  saveRecentSearches,
  pushRecentSearch,
  MAX_PRESETS,
} from "@/lib/presets";
import { BrandKey, detectBrand, countBrands } from "@/lib/brands";
import { downloadXls } from "@/lib/xls";
import {
  LatLng,
  pointInPolygon,
  pointInCircle,
  polygonAreaSqMi,
  RadiusStep,
} from "@/lib/geo";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const TEXAS_CENTER = { lat: 31.3, lng: -99.3 };
const TEXAS_ZOOM = 5.5;
const LIST_LIMIT = 200;
const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];
const DATA_PERIOD = "May 2026";

const SORTERS: Record<SortKey, (a: HotelFeature, b: HotelFeature) => number> = {
  "revpar-desc": (a, b) => (b.properties.revpar ?? -1) - (a.properties.revpar ?? -1),
  "revpar-asc": (a, b) =>
    (a.properties.revpar ?? Infinity) - (b.properties.revpar ?? Infinity),
  "rooms-desc": (a, b) => (b.properties.rooms ?? -1) - (a.properties.rooms ?? -1),
  "name-asc": (a, b) => a.properties.name.localeCompare(b.properties.name),
};

const MAP_TYPES = [
  { label: "Roadmap", id: "roadmap" },
  { label: "Satellite", id: "hybrid" },
  { label: "Terrain", id: "terrain" },
] as const;

// RevPAR bucket colors as RGBA for deck.gl.
const BUCKET_RGBA: Record<Bucket, [number, number, number, number]> = {
  red: [238, 34, 51, 255],
  yellow: [245, 179, 1, 255],
  gray: [154, 160, 166, 230],
};

// ---------------------------------------------------------------------------
// Marker clustering (zoom-aware).
// ---------------------------------------------------------------------------
// Clustering config. `clusterRadius` is the nominal merge radius in pixels;
// `disengageZoom` is the zoom level at/above which we drop clustering and
// render raw individual pins (so dense urban cores stay precise on close-in
// views). At Texas-wide zoom (~5-6) this produces a handful of metro clusters.
type ClusteringSettings = {
  clusterRadius: number; // px — nominal merge radius for the cluster bubble
  disengageZoom: number; // zoom >= this → raw pins, no clustering
};

const CLUSTERING: ClusteringSettings = {
  clusterRadius: 40,
  disengageZoom: 10,
};

// A grid cluster: members plus a weighted centroid and dominant bucket.
type Cluster = {
  cluster: true;
  cluster_id: string;
  count: number;
  lng: number;
  lat: number;
  bucket: Bucket;
  members: HotelFeature[];
};

// Grid-cluster features in lng/lat space. The cell size is derived from zoom so
// that one grid cell maps to roughly `clusterRadius` screen pixels — coarse
// when zoomed out, fine when zoomed in. This is an approximation of pixel-space
// clustering that needs no synchronous map projection. Singletons (one member)
// are returned as raw features so they render as normal pins.
function clusterFeatures(
  features: HotelFeature[],
  zoom: number,
  radiusPx: number
): { clusters: Cluster[]; singles: HotelFeature[] } {
  // World pixels per degree of longitude at this zoom: 256 * 2^zoom / 360.
  const worldPx = 256 * Math.pow(2, zoom);
  const pxPerDeg = worldPx / 360;
  const cellDeg = radiusPx / Math.max(pxPerDeg, 1e-6);
  // Use the global Map constructor explicitly — the imported `Map` component
  // from @vis.gl/react-google-maps shadows it in this module scope.
  const cells: globalThis.Map<string, HotelFeature[]> = new globalThis.Map();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const cx = Math.floor(lng / cellDeg);
    const cy = Math.floor(lat / cellDeg);
    const key = `${cx}:${cy}`;
    const arr = cells.get(key);
    if (arr) arr.push(f);
    else cells.set(key, [f]);
  }
  const clusters: Cluster[] = [];
  const singles: HotelFeature[] = [];
  for (const [key, members] of cells) {
    if (members.length === 1) {
      singles.push(members[0]);
      continue;
    }
    let sx = 0;
    let sy = 0;
    const tally: Record<Bucket, number> = { red: 0, yellow: 0, gray: 0 };
    for (const m of members) {
      const [lng, lat] = m.geometry.coordinates;
      sx += lng;
      sy += lat;
      tally[m.properties.bucket] += 1;
    }
    // Dominant bucket drives the bubble color (red wins ties — it's the lead).
    const bucket: Bucket =
      tally.red >= tally.yellow && tally.red >= tally.gray
        ? "red"
        : tally.yellow >= tally.gray
        ? "yellow"
        : "gray";
    clusters.push({
      cluster: true,
      cluster_id: key,
      count: members.length,
      lng: sx / members.length,
      lat: sy / members.length,
      bucket,
      members,
    });
  }
  return { clusters, singles };
}

// How individual pins are sized. `constant` preserves the original fixed 5px
// radius; `revpar`/`rooms` scale each pin's radius linearly within the metric's
// observed min/max across the filtered set.
type SizeBy = "constant" | "revpar" | "rooms";

// Pixel band individual pins are scaled into when sizing by a metric.
const PIN_MIN_PX = 3;
const PIN_MAX_PX = 12;
// Fallback radius for pins whose metric value is null/missing.
const PIN_FALLBACK_PX = 5;

// A hovered pin plus the screen-space (deck canvas) coordinates of the cursor,
// so MapView can position a small tooltip near the pointer.
type HoverInfo = {
  feature: HotelFeature;
  x: number;
  y: number;
};

// GPU markers via deck.gl. Below `disengageZoom` nearby hotels merge into
// cluster bubbles (count label) that expand on click; at/above it, every hotel
// is an individual pickable pin. With `sizeBy` set to a metric, individual pins
// are sized proportionally to that metric (default `constant` = original 5px).
function MarkersLayer({
  features,
  visible,
  onSelect,
  onHover,
  sizeBy = "constant",
}: {
  features: HotelFeature[];
  visible: boolean;
  onSelect: (f: HotelFeature) => void;
  onHover?: (info: HoverInfo | null) => void;
  sizeBy?: SizeBy;
}) {
  const map = useMap();
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);
  const [zoom, setZoom] = useState<number>(TEXAS_ZOOM);

  useEffect(() => {
    if (!map) return;
    const overlay = new GoogleMapsOverlay({ interleaved: false });
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  // Track zoom so clustering re-buckets as the user zooms in/out.
  useEffect(() => {
    if (!map) return;
    const sync = () => setZoom(map.getZoom() ?? TEXAS_ZOOM);
    sync();
    const l = map.addListener("zoom_changed", sync);
    return () => l.remove();
  }, [map]);

  // Fit the map to a cluster's bounds (expand on click). Falls back to a
  // zoom-in step when all members share a point.
  const expandCluster = useCallback(
    (c: Cluster) => {
      if (!map || !window.google) return;
      const b = new google.maps.LatLngBounds();
      for (const m of c.members) {
        const [lng, lat] = m.geometry.coordinates;
        b.extend({ lat, lng });
      }
      if (b.getNorthEast().equals(b.getSouthWest())) {
        map.panTo(b.getCenter());
        map.setZoom(Math.min((map.getZoom() ?? TEXAS_ZOOM) + 2, 16));
      } else {
        map.fitBounds(b, 64);
      }
    },
    [map]
  );

  // Linear value→radius mapping for the selected metric. Computed over the
  // current filtered features so the band always spans the visible spread.
  // Returns a constant 5px when `sizeBy === "constant"` (original behavior) and
  // a fallback for null/missing values.
  const sizeScale = useMemo(() => {
    if (sizeBy === "constant") return () => PIN_FALLBACK_PX;
    let min = Infinity;
    let max = -Infinity;
    for (const f of features) {
      const v = f.properties[sizeBy];
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // No usable values (or a single value) → fall back to the constant radius.
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return () => PIN_FALLBACK_PX;
    }
    const span = max - min;
    return (value: number | null) => {
      if (value == null || !Number.isFinite(value)) return PIN_FALLBACK_PX;
      const t = Math.min(1, Math.max(0, (value - min) / span));
      return PIN_MIN_PX + t * (PIN_MAX_PX - PIN_MIN_PX);
    };
  }, [features, sizeBy]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!visible) {
      overlay.setProps({ layers: [] });
      return;
    }

    const layers: Layer[] = [];
    const clusterOn = zoom < CLUSTERING.disengageZoom;
    const { clusters, singles } = clusterOn
      ? clusterFeatures(features, zoom, CLUSTERING.clusterRadius)
      : { clusters: [] as Cluster[], singles: features };

    // Individual pins — singletons when clustering, every hotel otherwise.
    layers.push(
      new ScatterplotLayer<HotelFeature>({
        id: "hotels",
        data: singles,
        getPosition: (f) => f.geometry.coordinates as [number, number],
        getFillColor: (f) => BUCKET_RGBA[f.properties.bucket],
        getRadius: (f) =>
          sizeBy === "constant"
            ? 5
            : sizeScale(f.properties[sizeBy]),
        radiusUnits: "pixels",
        radiusMinPixels: 2.5,
        // Constant mode keeps the original tight 8px clamp; metric sizing needs
        // headroom up to PIN_MAX_PX so large-RevPAR/room pins aren't clipped.
        radiusMaxPixels: sizeBy === "constant" ? 8 : PIN_MAX_PX,
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 1,
        getLineColor: [255, 255, 255, 230],
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 80],
        onClick: (info) => {
          if (info.object) onSelect(info.object as HotelFeature);
        },
        // Hover tooltip: fire on pin mouseover with the cursor's screen-space
        // (x,y) so MapView can position a small popup; clear it on mouseout
        // (info.object null). Independent of selection — never touches it.
        onHover: (info) => {
          if (!onHover) return;
          if (info.object) {
            onHover({
              feature: info.object as HotelFeature,
              x: info.x,
              y: info.y,
            });
          } else {
            onHover(null);
          }
        },
        updateTriggers: {
          getFillColor: singles,
          getRadius: [singles, sizeBy, sizeScale],
        },
      })
    );

    if (clusters.length > 0) {
      // Area-proportional bubble radius: sqrt(count) so the *area* of the
      // bubble reads as magnitude (doubling area for ~2x members), clamped to a
      // calm pixel band. `clusterRadius * 0.32` sets the floor; the sqrt term
      // grows smoothly without the jumpiness of log2.
      const clusterRadiusPx = (c: Cluster) =>
        CLUSTERING.clusterRadius * 0.32 + Math.sqrt(c.count) * 2.4;

      // Soft outer halo: a larger, very-low-alpha disc behind each bubble that
      // separates it from the basemap (Mapbox/Google-style glow). Unstroked,
      // not pickable, so clicks pass through to the bubble below it.
      layers.push(
        new ScatterplotLayer<Cluster>({
          id: "cluster-halo",
          data: clusters,
          getPosition: (c) => [c.lng, c.lat],
          getFillColor: (c) => {
            const [r, g, bl] = BUCKET_RGBA[c.bucket];
            return [r, g, bl, 38];
          },
          getRadius: (c) => clusterRadiusPx(c) + 6,
          radiusUnits: "pixels",
          radiusMinPixels: 22,
          radiusMaxPixels: 54,
          stroked: false,
          pickable: false,
          updateTriggers: { getFillColor: clusters, getRadius: clusters },
        })
      );

      // Cluster bubbles: a soft, slightly translucent filled circle with a
      // crisp white ring. Translucent fill lets the basemap read through a
      // touch; per-bucket color still signals the RevPAR tier.
      layers.push(
        new ScatterplotLayer<Cluster>({
          id: "cluster-bubbles",
          data: clusters,
          getPosition: (c) => [c.lng, c.lat],
          getFillColor: (c) => {
            const [r, g, bl] = BUCKET_RGBA[c.bucket];
            return [r, g, bl, 175];
          },
          getRadius: clusterRadiusPx,
          radiusUnits: "pixels",
          radiusMinPixels: 16,
          radiusMaxPixels: 46,
          stroked: true,
          lineWidthUnits: "pixels",
          getLineWidth: 1.5,
          getLineColor: [255, 255, 255, 235],
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onClick: (info) => {
            if (info.object) expandCluster(info.object as Cluster);
          },
          // Clusters aren't individual hotels — never show the hotel tooltip,
          // and clear any stale one when the cursor enters a bubble.
          onHover: () => onHover?.(null),
          updateTriggers: { getFillColor: clusters, getRadius: clusters },
        })
      );

      // Count labels centered on each bubble. SDF font lets us draw a dark
      // outline around white glyphs so the count stays legible on any bucket
      // color. Font size scales modestly with the bubble radius.
      layers.push(
        new TextLayer<Cluster>({
          id: "cluster-labels",
          data: clusters,
          getPosition: (c) => [c.lng, c.lat],
          getText: (c) =>
            c.count >= 1000 ? `${Math.round(c.count / 100) / 10}k` : `${c.count}`,
          getSize: (c) =>
            Math.max(11, Math.min(clusterRadiusPx(c) * 0.62, 20)),
          sizeUnits: "pixels",
          getColor: [255, 255, 255, 255],
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 600,
          fontSettings: { sdf: true },
          outlineWidth: 2,
          outlineColor: [17, 24, 39, 220],
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          // Labels are decoration; clicks fall through to the bubble layer.
          pickable: false,
          updateTriggers: { getText: clusters, getSize: clusters },
        })
      );
    }

    overlay.setProps({ layers });
    // `map` is in the deps so this re-runs once the overlay is created (Effect A
    // runs first in the same commit); without it the layer never attaches on
    // first load and pins never paint.
  }, [map, features, visible, onSelect, onHover, zoom, expandCluster, sizeBy, sizeScale]);

  return null;
}

// ---------------------------------------------------------------------------
// Hover tooltip — small popup near the cursor for a hovered pin. Renders the
// hotel name, RevPAR, and room count. Positioned absolutely within the map
// container at the deck-canvas (x,y) of the cursor, nudged +12px so it sits
// just off the pointer. Independent of click selection.
// ---------------------------------------------------------------------------
function HoverTooltip({ info }: { info: HoverInfo | null }) {
  if (!info) return null;
  const p = info.feature.properties;
  const revpar =
    p.revpar != null
      ? `$${Math.round(p.revpar).toLocaleString()}`
      : "RevPAR n/a";
  const rooms = p.rooms != null ? `${p.rooms.toLocaleString()} rooms` : "Rooms n/a";
  return (
    <div
      className="pointer-events-none absolute z-50 w-[150px] rounded-lg bg-surface p-2 shadow-md ring-1 ring-border print:hidden"
      style={{ left: info.x + 12, top: info.y + 12 }}
    >
      <div className="truncate text-xs font-semibold text-foreground">
        {p.name}
      </div>
      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{revpar}</div>
      <div className="text-[11px] text-subtle">{rooms}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RevPAR-weighted heatmap layer (visualization library).
// ---------------------------------------------------------------------------
function HeatLayer({
  features,
  visible,
}: {
  features: HotelFeature[];
  visible: boolean;
}) {
  const map = useMap();
  const vis = useMapsLibrary("visualization");
  const layerRef = useRef<{ setMap: (m: google.maps.Map | null) => void } | null>(
    null
  );

  useEffect(() => {
    if (!map || !vis) return;
    if (!visible) {
      layerRef.current?.setMap(null);
      return;
    }
    const data = features
      .filter((f) => f.properties.revpar != null)
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return {
          location: new google.maps.LatLng(lat, lng),
          weight: f.properties.revpar as number,
        };
      });
    const layer = new (vis as any).HeatmapLayer({
      data,
      radius: 24,
      opacity: 0.8,
      maxIntensity: 6000,
    });
    layer.setMap(map);
    layerRef.current = layer;
    return () => layer.setMap(null);
  }, [map, vis, features, visible]);

  return null;
}

// ---------------------------------------------------------------------------
// Imperative bits driven by the toolbar/zoom controls + viewport tracking.
// ---------------------------------------------------------------------------
function MapController({
  mapTypeId,
  onBounds,
  registerControls,
  onStreetView,
}: {
  mapTypeId: string;
  onBounds: (b: [number, number, number, number]) => void;
  registerControls: (api: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetNorth: () => void;
    recenter: () => void;
    flyTo: (lng: number, lat: number) => void;
  }) => void;
  onStreetView: (visible: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapTypeId as google.maps.MapTypeId);
  }, [map, mapTypeId]);

  // Enable the draggable Street View "pegman" + an inline panorama. We run
  // disableDefaultUI on the map, so re-enable just this control and tuck it
  // bottom-left (clear of the header, right panel, and zoom controls).
  useEffect(() => {
    if (!map || !window.google) return;
    map.setOptions({
      streetViewControl: true,
      streetViewControlOptions: {
        position: google.maps.ControlPosition.LEFT_BOTTOM,
      },
    });
    // When the pegman opens Street View, tell MapView so it can clear the
    // overlay UI + pins out of the way (otherwise they bury the panorama and
    // its exit button).
    const sv = map.getStreetView();
    const l = sv.addListener("visible_changed", () =>
      onStreetView(sv.getVisible())
    );
    return () => l.remove();
  }, [map, onStreetView]);

  useEffect(() => {
    if (!map) return;
    const emit = () => {
      const b = map.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      onBounds([sw.lng(), sw.lat(), ne.lng(), ne.lat()]);
    };
    const l = map.addListener("idle", emit);
    return () => l.remove();
  }, [map, onBounds]);

  useEffect(() => {
    if (!map) return;
    registerControls({
      zoomIn: () => map.setZoom((map.getZoom() ?? TEXAS_ZOOM) + 1),
      zoomOut: () => map.setZoom((map.getZoom() ?? TEXAS_ZOOM) - 1),
      resetNorth: () => map.setHeading(0),
      recenter: () => {
        map.panTo(TEXAS_CENTER);
        map.setZoom(TEXAS_ZOOM);
      },
      flyTo: (lng, lat) => {
        map.panTo({ lat, lng });
        map.setZoom(Math.max(map.getZoom() ?? TEXAS_ZOOM, 14));
      },
    });
  }, [map, registerControls]);

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function MapView() {
  // Read shared-link state once, synchronously, so first paint matches the URL.
  const initialUrlState = useRef(
    typeof window === "undefined" ? {} : decodeState(window.location.search)
  ).current;

  const [data, setData] = useState<HotelCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  // Trend/T12 live in a separate file so the map's geojson stays lean; fetched
  // lazily after mount and keyed by feature id. Null until it resolves.
  const [historyData, setHistoryData] = useState<Record<
    number,
    HotelHistory
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/hotel-history.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        if (!cancelled) setHistoryData(h);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // When the most recent successful /hotels.geojson fetch completed. Drives the
  // staleness label in the header. null until the first load resolves.
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  // Refresh button feedback: "idle" normally, "loading" while a refetch is in
  // flight, "refreshed" for a 2s success flash. A ref guards against duplicate
  // concurrent fetches (button mashing / overlapping requests).
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "refreshed"
  >("idle");
  const refreshingRef = useRef(false);
  // Tracks Google Maps JS API load failures (bad/over-quota key, 403, script
  // 404, network timeout). Surfaced via APIProvider's onError callback below.
  const [mapsApiError, setMapsApiError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HotelFeature | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>(
    initialUrlState.layer ?? "pins"
  );
  const [mapTypeIndex, setMapTypeIndex] = useState(
    initialUrlState.mapType != null && initialUrlState.mapType < MAP_TYPES.length
      ? initialUrlState.mapType
      : 0
  );
  const [activeBuckets, setActiveBuckets] = useState<Set<Bucket>>(
    initialUrlState.buckets && initialUrlState.buckets.length > 0
      ? new Set(initialUrlState.buckets)
      : new Set(ALL_BUCKETS)
  );
  const [bounds, setBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [query, setQuery] = useState(initialUrlState.q ?? "");
  const [sort, setSort] = useState<SortKey>(
    initialUrlState.sort ?? "revpar-desc"
  );
  const [rightTab, setRightTab] = useState<
    "list" | "markets" | "rollups" | "analytics" | "watchlist"
  >("list");
  const [rollupDim, setRollupDim] = useState<RollupDim>("zip");
  // Mobile bottom-sheet collapse (desktop always shows the full side panel).
  const [sheetOpen, setSheetOpen] = useState(true);
  // True while the Street View panorama is open — hide our overlay UI + pins.
  const [svOpen, setSvOpen] = useState(false);
  // Hovered pin (name/RevPAR/rooms tooltip). Independent of `selected` — hover
  // and click selection never affect each other.
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  // Touchscreen layout switch — drives PropertyCard's bottom-sheet rendering.
  // Matches the Tailwind `md` breakpoint (<768px) used across the overlay UI.
  const isMobile = useMediaQuery("(max-width: 767px)");
  const watchlist = useWatchlist();
  const [revparRange, setRevparRange] = useState<Range | null>(null);
  const [roomsRange, setRoomsRange] = useState<Range | null>(null);
  const [activeBrands, setActiveBrands] = useState<Set<BrandKey>>(new Set());
  // Saved filter views + recent searches (both persisted in localStorage).
  // Initialized synchronously so the menu is populated on first paint.
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>(() =>
    loadPresets()
  );
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    loadRecentSearches()
  );
  const [helpOpen, setHelpOpen] = useState(false);
  // Light/dark theme. Initialized synchronously from localStorage so first
  // paint matches the persisted preference (no flash of the wrong theme).
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("tx-hotel-heatmap-darkMode") === "1";
    } catch {
      return false;
    }
  });
  const [compare, setCompare] = useState<HotelFeature[]>([]);
  const COMPARE_MAX = 3;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Area selection (polygon lasso + radius) -------------------------
  // areaMode === null  → normal viewport-driven list
  // areaMode === "polygon" → drawing/holding a freeform ring
  // areaMode === "radius"  → placing/holding a circle center
  const [areaMode, setAreaMode] = useState<null | "polygon" | "radius">(null);
  const [polyVertices, setPolyVertices] = useState<Vertex[]>([]);
  const [polyClosed, setPolyClosed] = useState(false);
  const [circleCenter, setCircleCenter] = useState<LatLng | null>(null);
  const [circleRadius, setCircleRadius] = useState<RadiusStep>(3);

  const controls = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetNorth: () => void;
    recenter: () => void;
    flyTo: (lng: number, lat: number) => void;
  } | null>(null);

  // Single source of truth for loading the dataset. Cache-busts with a `?t=`
  // query param so a manual refresh always bypasses Vercel's edge / browser
  // cache and picks up a freshly published public/hotels.geojson.
  const loadData = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch(`/hotels.geojson?t=${Date.now()}`, { signal });
    if (!r.ok) throw new Error(`hotels.geojson ${r.status}`);
    const json: HotelCollection = await r.json();
    setData(json);
    setDataError(null);
    setLastFetchTime(Date.now());
  }, []);

  // Initial load. Aborts on unmount to avoid a setState-after-unmount.
  useEffect(() => {
    const ctrl = new AbortController();
    loadData(ctrl.signal).catch((e) => {
      if (e?.name === "AbortError") return;
      setDataError(String(e?.message ?? e));
    });
    return () => ctrl.abort();
  }, [loadData]);

  // Manual refresh (header button / error-state retry). Re-runs the same fetch,
  // guarded against overlapping requests, and flashes a checkmark for 2s on
  // success.
  const refreshData = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshState("loading");
    loadData()
      .then(() => {
        setRefreshState("refreshed");
        setTimeout(() => setRefreshState("idle"), 2000);
      })
      .catch((e) => {
        setDataError(String(e?.message ?? e));
        setRefreshState("idle");
      })
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [loadData]);

  // Whole-days elapsed since the data last loaded. null until the first fetch
  // resolves; the header only surfaces a staleness label once this exceeds 1.
  const dataAge =
    lastFetchTime == null
      ? null
      : Math.floor((Date.now() - lastFetchTime) / (1000 * 60 * 60 * 24));

  // Persist the theme choice so it survives reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "tx-hotel-heatmap-darkMode",
        darkMode ? "1" : "0"
      );
    } catch {
      /* ignore storage failures (private mode / quota) */
    }
  }, [darkMode]);

  // Persist saved presets + recent searches whenever they change.
  useEffect(() => {
    savePresets(savedPresets);
  }, [savedPresets]);
  useEffect(() => {
    saveRecentSearches(recentSearches);
  }, [recentSearches]);

  // Record non-empty searches into the recent list (debounced so we don't
  // capture every keystroke — only queries the user pauses on).
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      setRecentSearches((prev) => pushRecentSearch(prev, q));
    }, 800);
    return () => clearTimeout(t);
  }, [query]);

  // Drop any lingering hover tooltip when pins are no longer the active layer
  // or Street View opens (the pin layer that drives `setHovered(null)` on
  // mouseout is gone in those states, so clear it ourselves).
  useEffect(() => {
    if (svOpen || layerMode !== "pins") setHovered(null);
  }, [svOpen, layerMode]);

  const revparIndex = useMemo(
    () => buildRevparIndex(data?.features ?? []),
    [data]
  );

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { red: 0, yellow: 0, gray: 0 };
    data?.features.forEach((f) => {
      if (f.properties.bucket in c) c[f.properties.bucket] += 1;
    });
    return c;
  }, [data]);

  // Data-driven bounds for the range sliders (RevPAR is a small daily scale,
  // rooms can spike into the thousands).
  const ranges = useMemo(() => {
    let rpLo = Infinity,
      rpHi = -Infinity,
      rmLo = Infinity,
      rmHi = -Infinity;
    data?.features.forEach((f) => {
      const { revpar, rooms } = f.properties;
      if (revpar != null) {
        if (revpar < rpLo) rpLo = revpar;
        if (revpar > rpHi) rpHi = revpar;
      }
      if (rooms != null) {
        if (rooms < rmLo) rmLo = rooms;
        if (rooms > rmHi) rmHi = rooms;
      }
    });
    return {
      revpar: [
        Number.isFinite(rpLo) ? Math.floor(rpLo) : 0,
        Number.isFinite(rpHi) ? Math.ceil(rpHi) : 0,
      ] as Range,
      rooms: [
        Number.isFinite(rmLo) ? Math.floor(rmLo) : 0,
        Number.isFinite(rmHi) ? Math.ceil(rmHi) : 0,
      ] as Range,
    };
  }, [data]);

  const sortedRevpars = useMemo(() => {
    const arr: number[] = [];
    data?.features.forEach((f) => {
      if (f.properties.revpar != null) arr.push(f.properties.revpar);
    });
    return arr.sort((a, b) => a - b);
  }, [data]);

  // Once bounds are known, default each slider to the full span.
  useEffect(() => {
    if (!data) return;
    setRevparRange(ranges.revpar);
    setRoomsRange(ranges.rooms);
  }, [data, ranges]);

  const revparVal = revparRange ?? ranges.revpar;
  const roomsVal = roomsRange ?? ranges.rooms;

  const filtered = useMemo<HotelFeature[]>(() => {
    if (!data) return [];
    const allBuckets = activeBuckets.size === ALL_BUCKETS.length;
    const brandActive = activeBrands.size > 0;
    const [rpLo, rpHi] = revparVal;
    const [rmLo, rmHi] = roomsVal;
    const rpActive = rpLo > ranges.revpar[0] || rpHi < ranges.revpar[1];
    const rmActive = rmLo > ranges.rooms[0] || rmHi < ranges.rooms[1];
    if (allBuckets && !brandActive && !rpActive && !rmActive) return data.features;
    return data.features.filter((f) => {
      const p = f.properties;
      if (!allBuckets && !activeBuckets.has(p.bucket)) return false;
      if (brandActive && !activeBrands.has(detectBrand(p.name))) return false;
      if (rpActive) {
        if (p.revpar == null) return false;
        if (p.revpar < rpLo || p.revpar > rpHi) return false;
      }
      if (rmActive) {
        if (p.rooms == null) return false;
        if (p.rooms < rmLo || p.rooms > rmHi) return false;
      }
      return true;
    });
  }, [data, activeBuckets, activeBrands, revparVal, roomsVal, ranges]);

  // Data-driven brand counts (for the brand filter control).
  const brandCounts = useMemo(
    () => countBrands(data?.features ?? []),
    [data]
  );

  // An active, finished area selection (closed polygon OR placed circle).
  // When set, it overrides the viewport/search scope for stats + list.
  const areaSelection = useMemo<{
    label: string;
    detail: string;
    features: HotelFeature[];
  } | null>(() => {
    if (areaMode === "polygon" && polyClosed && polyVertices.length >= 3) {
      const ring = polyVertices as [number, number][];
      const feats = filtered.filter((f) =>
        pointInPolygon(
          f.geometry.coordinates as [number, number],
          ring
        )
      );
      const sqmi = polygonAreaSqMi(ring);
      return {
        label: "Drawn area",
        detail: `${polyVertices.length} vertices · ~${
          sqmi >= 10 ? Math.round(sqmi) : sqmi.toFixed(1)
        } sq mi`,
        features: feats,
      };
    }
    if (areaMode === "radius" && circleCenter) {
      const feats = filtered.filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return pointInCircle(lat, lng, circleCenter, circleRadius);
      });
      return {
        label: `${circleRadius} mi radius`,
        detail: `${feats.length.toLocaleString()} hotels within ${circleRadius} mi`,
        features: feats,
      };
    }
    return null;
  }, [
    areaMode,
    polyClosed,
    polyVertices,
    circleCenter,
    circleRadius,
    filtered,
  ]);

  // In-scope set: an active area selection wins; otherwise bucket/range filter
  // + (search text OR current viewport).
  const inScope = useMemo(() => {
    if (areaSelection) return [...areaSelection.features].sort(SORTERS[sort]);
    const q = query.trim().toLowerCase();
    let feats = filtered;
    if (q.startsWith("zip:")) {
      const z = q.slice(4).trim();
      feats = feats.filter(
        (f) => (f.properties.zip ?? "").toString().trim().toLowerCase() === z
      );
    } else if (q) {
      feats = feats.filter(
        (f) =>
          f.properties.name.toLowerCase().includes(q) ||
          f.properties.city.toLowerCase().includes(q)
      );
    } else if (bounds) {
      const [w, s, e, n] = bounds;
      feats = feats.filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return lng >= w && lng <= e && lat >= s && lat <= n;
      });
    }
    return [...feats].sort(SORTERS[sort]);
  }, [areaSelection, filtered, bounds, query, sort]);

  const listData = useMemo(
    () => ({ rows: inScope.slice(0, LIST_LIMIT), total: inScope.length }),
    [inScope]
  );

  const stats = useMemo(() => computeStats(inScope), [inScope]);
  const briefRows = useMemo(() => inScope.slice(0, 25), [inScope]);
  const marketRows = useMemo(() => aggregateMarkets(filtered), [filtered]);
  // Analytics charts reflect the in-scope set (selection/viewport/search).
  const inScopeMarkets = useMemo(() => aggregateMarkets(inScope), [inScope]);
  const rollupRows = useMemo(
    () => aggregateRollup(filtered, rollupDim),
    [filtered, rollupDim]
  );

  const exportCsv = useCallback(() => {
    const header = [
      "name", "address", "city", "state", "zip", "rooms", "revpar",
      "adr", "occupancy", "revenue", "bucket", "lng", "lat",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const f of inScope) {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      lines.push(
        [
          p.name, p.address, p.city, p.state, p.zip, p.rooms, p.revpar,
          p.adr, p.occupancy, p.revenue, p.bucket, lng, lat,
        ]
          .map(esc)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tx-hotels-${inScope.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [inScope]);

  const flyToFeature = useCallback((f: HotelFeature) => {
    setSelected(f);
    const [lng, lat] = f.geometry.coordinates;
    controls.current?.flyTo(lng, lat);
  }, []);

  const isCompared = useCallback(
    (key: string) => compare.some((f) => featureKey(f) === key),
    [compare]
  );

  const toggleCompare = useCallback((f: HotelFeature) => {
    const key = featureKey(f);
    setCompare((prev) => {
      if (prev.some((x) => featureKey(x) === key))
        return prev.filter((x) => featureKey(x) !== key);
      if (prev.length >= COMPARE_MAX) return prev; // max 3 — ignore extra adds
      return [...prev, f];
    });
  }, []);

  const removeCompare = useCallback(
    (key: string) =>
      setCompare((prev) => prev.filter((x) => featureKey(x) !== key)),
    []
  );

  const clearCompare = useCallback(() => setCompare([]), []);

  const selectMarket = useCallback(
    (city: string) => {
      setSelected(null);
      setQuery(city);
      setRightTab("list");
      const hit = filtered.find(
        (f) =>
          (f.properties.city || "").trim().toLowerCase() ===
          city.trim().toLowerCase()
      );
      if (hit) {
        const [lng, lat] = hit.geometry.coordinates;
        controls.current?.flyTo(lng, lat);
      }
    },
    [filtered]
  );

  const selectRollup = useCallback(
    (dim: RollupDim, key: string) => {
      setSelected(null);
      setRightTab("list");
      if (dim === "zip") {
        setQuery(`zip:${key}`);
        const hit = filtered.find(
          (f) => (f.properties.zip ?? "").toString().trim() === key
        );
        if (hit) {
          const [lng, lat] = hit.geometry.coordinates;
          controls.current?.flyTo(lng, lat);
        }
      } else {
        setQuery(key);
        const hit = filtered.find(
          (f) =>
            (f.properties.city || "").trim().toLowerCase() ===
            key.trim().toLowerCase()
        );
        if (hit) {
          const [lng, lat] = hit.geometry.coordinates;
          controls.current?.flyTo(lng, lat);
        }
      }
    },
    [filtered]
  );

  const toggleBucket = (b: Bucket) =>
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      if (next.size === 0) return new Set(ALL_BUCKETS);
      return next;
    });

  const resetAll = useCallback(() => {
    setActiveBuckets(new Set(ALL_BUCKETS));
    setActiveBrands(new Set());
    setRevparRange(ranges.revpar);
    setRoomsRange(ranges.rooms);
    setQuery("");
  }, [ranges]);

  // ---- Saved views / recent searches ----------------------------------
  // Snapshot the current filter state into a named preset (newest first,
  // capped at MAX_PRESETS — oldest dropped).
  const savePreset = useCallback(
    (name: string) => {
      const preset: FilterPreset = {
        name,
        buckets: ALL_BUCKETS.filter((b) => activeBuckets.has(b)),
        revparRange: revparVal,
        roomsRange: roomsVal,
        activeBrands: new Set(activeBrands),
        query,
        createdAt: Date.now(),
      };
      setSavedPresets((prev) => [preset, ...prev].slice(0, MAX_PRESETS));
    },
    [activeBuckets, revparVal, roomsVal, activeBrands, query]
  );

  // Restore every filter dimension from a preset.
  const loadPreset = useCallback((preset: FilterPreset) => {
    setActiveBuckets(
      new Set(preset.buckets.length ? preset.buckets : ALL_BUCKETS)
    );
    setRevparRange(preset.revparRange);
    setRoomsRange(preset.roomsRange);
    setActiveBrands(new Set(preset.activeBrands));
    setQuery(preset.query);
  }, []);

  const deletePreset = useCallback((createdAt: number) => {
    setSavedPresets((prev) => prev.filter((p) => p.createdAt !== createdAt));
  }, []);

  // ---- Area tool controls ---------------------------------------------
  const clearArea = useCallback(() => {
    setAreaMode(null);
    setPolyVertices([]);
    setPolyClosed(false);
    setCircleCenter(null);
  }, []);

  const togglePolygon = useCallback(() => {
    setSelected(null);
    setCircleCenter(null); // a polygon and a circle never coexist
    setAreaMode((m) => {
      if (m === "polygon") {
        setPolyVertices([]);
        setPolyClosed(false);
        return null;
      }
      setPolyVertices([]);
      setPolyClosed(false);
      return "polygon";
    });
  }, []);

  const toggleRadius = useCallback(() => {
    setSelected(null);
    setPolyVertices([]); // clear any in-progress/closed polygon first
    setPolyClosed(false);
    setAreaMode((m) => {
      if (m === "radius") {
        setCircleCenter(null);
        return null;
      }
      setCircleCenter(null);
      return "radius";
    });
  }, []);

  // Routes a bare map click. While an area tool is armed it feeds the tool;
  // otherwise it just dismisses the property card (original behavior).
  const onMapClick = useCallback(
    (e: { detail?: { latLng?: { lat: number; lng: number } | null } }) => {
      if (areaMode === "radius") {
        const ll = e.detail?.latLng;
        if (ll) setCircleCenter({ lat: ll.lat, lng: ll.lng });
        return;
      }
      // Polygon clicks are handled inside PolygonTool's own map listener.
      if (areaMode === "polygon") return;
      setSelected(null);
    },
    [areaMode]
  );

  const hasFilters =
    activeBuckets.size < ALL_BUCKETS.length ||
    activeBrands.size > 0 ||
    revparVal[0] > ranges.revpar[0] ||
    revparVal[1] < ranges.revpar[1] ||
    roomsVal[0] > ranges.rooms[0] ||
    roomsVal[1] < ranges.rooms[1];

  const selectedKey = selected ? featureKey(selected) : null;
  const registerControls = useCallback((api: typeof controls.current) => {
    controls.current = api;
  }, []);

  // Keep the address bar in sync with the view (debounced, no navigation).
  const urlState: UrlState = useMemo(
    () => ({
      buckets: ALL_BUCKETS.filter((b) => activeBuckets.has(b)),
      layer: layerMode,
      mapType: mapTypeIndex,
      sort,
      q: query,
    }),
    [activeBuckets, layerMode, mapTypeIndex, sort, query]
  );

  useUrlState(urlState, (partial) => {
    if (partial.layer) setLayerMode(partial.layer);
    if (partial.mapType != null && partial.mapType < MAP_TYPES.length)
      setMapTypeIndex(partial.mapType);
    if (partial.buckets && partial.buckets.length > 0)
      setActiveBuckets(new Set(partial.buckets));
    if (partial.sort) setSort(partial.sort);
    if (partial.q != null) setQuery(partial.q);
  });

  useKeyboardShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
    onToggleLayers: () => {
      setSelected(null);
      setLayerMode((m) => (m === "pins" ? "heatmap" : "pins"));
    },
    onRecenter: () => controls.current?.recenter(),
    onEscape: () => {
      if (helpOpen) setHelpOpen(false);
      else if (areaMode) clearArea();
      else setSelected(null);
    },
    onToggleHelp: () => setHelpOpen((v) => !v),
    onClearAll: resetAll,
  });

  if (!GOOGLE_KEY) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-panel bg-surface p-6 text-center shadow-lg ring-1 ring-border">
          <h1 className="text-display">
            Google Maps key missing
          </h1>
          <p className="mt-2 text-meta text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            in your environment (and in Vercel) to render the map.
          </p>
        </div>
      </div>
    );
  }

  if (mapsApiError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-panel bg-surface p-6 text-center shadow-lg ring-1 ring-border">
          <h1 className="text-display">
            Google Maps failed to load
          </h1>
          <p className="mt-2 text-meta text-muted-foreground">{mapsApiError}</p>
          <button
            type="button"
            onClick={() => setMapsApiError(null)}
            className="transition-base mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-hover"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-screen w-screen ${darkMode ? "dark" : ""}`}>
      <div className="absolute inset-0 print:hidden">
        <APIProvider
          apiKey={GOOGLE_KEY}
          onError={(error) => {
            // Bad/over-quota key, 403, script 404, or network timeout — the JS
            // API never finishes loading. Swap the map for a recoverable card.
            console.error("Google Maps API failed to load", error);
            setMapsApiError(
              "Check your API key quota and network connection, then retry."
            );
          }}
        >
          <Map
            defaultCenter={TEXAS_CENTER}
            defaultZoom={TEXAS_ZOOM}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
            onClick={onMapClick}
          >
            <MapController
              mapTypeId={MAP_TYPES[mapTypeIndex].id}
              onBounds={setBounds}
              registerControls={registerControls}
              onStreetView={setSvOpen}
            />
            <MarkersLayer
              features={filtered}
              visible={layerMode === "pins" && !svOpen}
              onSelect={flyToFeature}
              onHover={setHovered}
            />
            <HeatLayer
              features={filtered}
              visible={layerMode === "heatmap" && !svOpen}
            />
            <PolygonTool
              active={areaMode === "polygon"}
              vertices={polyVertices}
              closed={polyClosed}
              onAddVertex={(v) => setPolyVertices((prev) => [...prev, v])}
              onClose={() =>
                setPolyVertices((prev) => {
                  if (prev.length >= 3) setPolyClosed(true);
                  return prev;
                })
              }
              onAbort={clearArea}
            />
            <RadiusTool
              active={areaMode === "radius"}
              center={circleCenter}
              radius={circleRadius}
              onRadiusChange={setCircleRadius}
              onClear={clearArea}
            />
          </Map>
        </APIProvider>
        {/* Hover tooltip — positioned in deck-canvas (x,y) space, which shares
            this inset-0 container. Hidden during Street View. */}
        {!svOpen && layerMode === "pins" && <HoverTooltip info={hovered} />}
      </div>

      <div className={`print:hidden ${svOpen ? "hidden" : ""}`}>
        <HeaderBar
          stats={stats}
          period={DATA_PERIOD}
          dataAge={dataAge}
          refreshState={refreshState}
          onRefresh={refreshData}
        />
        <div className="absolute right-3 top-2.5 z-40 flex items-center gap-2 md:right-4">
          <ShareButton
            urlState={urlState}
            ranges={ranges}
            revparVal={revparVal}
            roomsVal={roomsVal}
            count={listData.total}
          />
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="transition-base flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-md ring-1 ring-border hover:bg-muted hover:text-foreground"
          >
            {darkMode ? (
              // sun
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              // moon
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <BriefButton />
        </div>
      </div>

      <div className={`print:hidden ${svOpen ? "hidden" : ""}`}>
        <ToolRail
          layerMode={layerMode}
          mapTypeLabel={MAP_TYPES[mapTypeIndex].label}
          onLocate={() => controls.current?.recenter()}
          onToggleLayers={() => {
            setSelected(null);
            setLayerMode((m) => (m === "pins" ? "heatmap" : "pins"));
          }}
          onCycleMapType={() =>
            setMapTypeIndex((i) => (i + 1) % MAP_TYPES.length)
          }
          polygonActive={areaMode === "polygon"}
          radiusActive={areaMode === "radius"}
          onPolygon={togglePolygon}
          onRadius={toggleRadius}
        />
      </div>

      <div
        className={`absolute z-20 flex flex-col gap-2.5 print:hidden
          inset-x-2 bottom-2 max-h-[60vh]
          md:inset-x-auto md:left-auto md:right-4 md:top-[68px] md:bottom-4 md:w-80 md:max-h-none md:gap-3 ${
            svOpen ? "hidden" : ""
          }`}
      >
        {/* Mobile grabber: collapse the sheet to reveal the map. */}
        <button
          type="button"
          onClick={() => setSheetOpen((o) => !o)}
          className="flex shrink-0 items-center justify-center gap-2 rounded-panel bg-surface py-2 text-xs font-medium text-muted-foreground shadow-md ring-1 ring-border md:hidden"
        >
          <span className="h-1 w-8 rounded-full bg-border-strong" />
          {sheetOpen ? "Hide panel" : `Show ${listData.total.toLocaleString()} properties`}
        </button>

        <div
          className={`min-h-0 flex-col gap-2.5 md:flex md:gap-3 ${
            sheetOpen ? "flex flex-1" : "hidden"
          }`}
        >
        <LegendFilter
          active={activeBuckets}
          counts={counts}
          onToggle={toggleBucket}
          onReset={() => setActiveBuckets(new Set(ALL_BUCKETS))}
          layerMode={layerMode}
          revparCutoffs={
            sortedRevpars.length
              ? [
                  sortedRevpars[Math.floor(sortedRevpars.length / 3)],
                  sortedRevpars[Math.floor((sortedRevpars.length * 2) / 3)],
                ]
              : undefined
          }
        />
        <div className="hidden md:block">
          <RangeFilters
            revparMin={ranges.revpar[0]}
            revparMax={ranges.revpar[1]}
            revpar={revparVal}
            onRevparChange={setRevparRange}
            roomsMin={ranges.rooms[0]}
            roomsMax={ranges.rooms[1]}
            rooms={roomsVal}
            onRoomsChange={setRoomsRange}
            onReset={() => {
              setRevparRange(ranges.revpar);
              setRoomsRange(ranges.rooms);
            }}
          />
          <BrandFilter
            selected={activeBrands}
            onChange={setActiveBrands}
            counts={brandCounts}
            onReset={() => setActiveBrands(new Set())}
          />
          <div className="mt-2">
            <FilterPresets
              presets={savedPresets}
              recentSearches={recentSearches}
              canSave={hasFilters || query.trim().length > 0}
              onSavePreset={savePreset}
              onLoadPreset={loadPreset}
              onDeletePreset={deletePreset}
              onLoadSearch={setQuery}
            />
          </div>
        </div>
        {areaSelection ? (
          <AreaSummary
            label={areaSelection.label}
            detail={areaSelection.detail}
            features={areaSelection.features}
            onExport={exportCsv}
            onClear={clearArea}
          />
        ) : (
          <>
            <div className="flex shrink-0 gap-0.5 rounded-panel bg-surface p-1 shadow-md ring-1 ring-border">
              {([
                ["list", "Properties"],
                ["markets", "Markets"],
                ["rollups", "Rollups"],
                ["analytics", "Analytics"],
                ["watchlist", watchlist.ids.size ? `Saved ${watchlist.ids.size}` : "Saved"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRightTab(id)}
                  className={`transition-base flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[11px] font-medium ${
                    rightTab === id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {rightTab === "list" ? (
              <PropertyList
                rows={listData.rows}
                total={listData.total}
                limit={LIST_LIMIT}
                query={query}
                onQuery={setQuery}
                onSelect={flyToFeature}
                selectedKey={selectedKey}
                sort={sort}
                onSort={setSort}
                onExport={exportCsv}
                onExportXls={() => downloadXls(inScope, `tx-hotels-${inScope.length}.xls`)}
                searchInputRef={searchInputRef}
                onClear={resetAll}
                hasFilters={hasFilters}
                isCompared={isCompared}
                onToggleCompare={toggleCompare}
                compareMax={COMPARE_MAX}
                compareCount={compare.length}
                getPercentile={(f) =>
                  getHotelPercentiles(
                    f.properties.revpar,
                    f.properties.city,
                    revparIndex
                  ).statewide
                }
                savedKeys={watchlist.ids}
                onToggleSaved={watchlist.toggle}
              />
            ) : rightTab === "markets" ? (
              <MarketPanel rows={marketRows} onSelectMarket={selectMarket} />
            ) : rightTab === "rollups" ? (
              <RollupPanel
                rows={rollupRows}
                dim={rollupDim}
                onDimChange={setRollupDim}
                onSelect={selectRollup}
              />
            ) : rightTab === "analytics" ? (
              <AnalyticsPanel
                inScope={inScope}
                stats={stats}
                marketRows={inScopeMarkets}
                onSelectMarket={selectMarket}
                onSelectHotel={flyToFeature}
              />
            ) : (
              <WatchlistView
                features={data?.features ?? []}
                ids={watchlist.ids}
                onSelect={flyToFeature}
                onRemove={watchlist.toggle}
                onClear={watchlist.clear}
                selectedKey={selectedKey}
              />
            )}
          </>
        )}
        </div>
      </div>

      <div className={`print:hidden ${svOpen ? "hidden" : ""}`}>
        <ZoomControls
          bearing={0}
          onZoomIn={() => controls.current?.zoomIn()}
          onZoomOut={() => controls.current?.zoomOut()}
          onResetNorth={() => controls.current?.resetNorth()}
        />
      </div>

      {selected && !svOpen && (
        <PropertyCard
          hotel={selected.properties}
          history={
            selected.properties.id != null
              ? historyData?.[selected.properties.id]
              : undefined
          }
          onClose={() => setSelected(null)}
          isMobile={isMobile}
          percentiles={getHotelPercentiles(
            selected.properties.revpar,
            selected.properties.city,
            revparIndex
          )}
          streetViewUrl={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${
            selected.geometry.coordinates[1]
          },${selected.geometry.coordinates[0]}`}
        />
      )}

      {dataError && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 text-xs text-white shadow-md print:hidden">
          <span>
            No hotel data loaded yet — run{" "}
            <code className="font-mono">npm run build-data</code> to generate
            public/hotels.geojson.
          </span>
          <button
            type="button"
            onClick={refreshData}
            disabled={refreshState === "loading"}
            className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 font-medium text-white transition hover:bg-white/25 disabled:opacity-60"
          >
            {refreshState === "loading" ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {compare.length > 0 && !svOpen && (
        <CompareTray
          items={compare}
          sortedRevpars={sortedRevpars}
          onRemove={removeCompare}
          onClear={clearCompare}
          onFlyTo={flyToFeature}
          max={COMPARE_MAX}
        />
      )}

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PrintBrief stats={stats} topRows={briefRows} period={DATA_PERIOD} />
      {!svOpen && <Coachmark />}
    </div>
  );
}
