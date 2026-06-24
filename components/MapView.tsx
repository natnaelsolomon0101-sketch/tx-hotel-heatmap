"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer } from "@deck.gl/layers";

import {
  Bucket,
  HotelCollection,
  HotelFeature,
} from "@/lib/types";
import ToolRail, { LayerMode } from "./ToolRail";
import ZoomControls from "./ZoomControls";
import LegendFilter from "./LegendFilter";
import PropertyCard from "./PropertyCard";
import PropertyList, { featureKey, SortKey } from "./PropertyList";
import HeaderBar from "./HeaderBar";
import { computeStats } from "@/lib/stats";
import MarketPanel from "./MarketPanel";
import { aggregateMarkets } from "@/lib/markets";
import RangeFilters, { Range } from "./RangeFilters";
import { decodeState, useUrlState, UrlState } from "@/lib/urlState";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import ShortcutsHelp from "./ShortcutsHelp";
import BriefButton from "./BriefButton";
import PrintBrief from "./PrintBrief";
import Coachmark from "./Coachmark";

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
// GPU markers via deck.gl ScatterplotLayer.
// ---------------------------------------------------------------------------
function MarkersLayer({
  features,
  visible,
  onSelect,
}: {
  features: HotelFeature[];
  visible: boolean;
  onSelect: (f: HotelFeature) => void;
}) {
  const map = useMap();
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);

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

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!visible) {
      overlay.setProps({ layers: [] });
      return;
    }
    const layer = new ScatterplotLayer<HotelFeature>({
      id: "hotels",
      data: features,
      getPosition: (f) => f.geometry.coordinates as [number, number],
      getFillColor: (f) => BUCKET_RGBA[f.properties.bucket],
      getRadius: 5,
      radiusUnits: "pixels",
      radiusMinPixels: 2.5,
      radiusMaxPixels: 8,
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
      updateTriggers: { getFillColor: features },
    });
    overlay.setProps({ layers: [layer] });
  }, [features, visible, onSelect]);

  return null;
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
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapTypeId as google.maps.MapTypeId);
  }, [map, mapTypeId]);

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
  const [rightTab, setRightTab] = useState<"list" | "markets">("list");
  const [revparRange, setRevparRange] = useState<Range | null>(null);
  const [roomsRange, setRoomsRange] = useState<Range | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const controls = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetNorth: () => void;
    recenter: () => void;
    flyTo: (lng: number, lat: number) => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/hotels.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`hotels.geojson ${r.status}`);
        return r.json();
      })
      .then((json: HotelCollection) => !cancelled && setData(json))
      .catch((e) => !cancelled && setDataError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

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
    const [rpLo, rpHi] = revparVal;
    const [rmLo, rmHi] = roomsVal;
    const rpActive = rpLo > ranges.revpar[0] || rpHi < ranges.revpar[1];
    const rmActive = rmLo > ranges.rooms[0] || rmHi < ranges.rooms[1];
    if (allBuckets && !rpActive && !rmActive) return data.features;
    return data.features.filter((f) => {
      const p = f.properties;
      if (!allBuckets && !activeBuckets.has(p.bucket)) return false;
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
  }, [data, activeBuckets, revparVal, roomsVal, ranges]);

  // In-scope set: bucket/range filter + (search text OR current viewport).
  const inScope = useMemo(() => {
    const q = query.trim().toLowerCase();
    let feats = filtered;
    if (q) {
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
  }, [filtered, bounds, query, sort]);

  const listData = useMemo(
    () => ({ rows: inScope.slice(0, LIST_LIMIT), total: inScope.length }),
    [inScope]
  );

  const stats = useMemo(() => computeStats(inScope), [inScope]);
  const briefRows = useMemo(() => inScope.slice(0, 25), [inScope]);
  const marketRows = useMemo(() => aggregateMarkets(filtered), [filtered]);

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
    setRevparRange(ranges.revpar);
    setRoomsRange(ranges.rooms);
    setQuery("");
  }, [ranges]);

  const hasFilters =
    activeBuckets.size < ALL_BUCKETS.length ||
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
      else setSelected(null);
    },
    onToggleHelp: () => setHelpOpen((v) => !v),
  });

  if (!GOOGLE_KEY) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#eceff1] p-8">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-gray-900">
            Google Maps key missing
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Set{" "}
            <code className="rounded bg-gray-100 px-1">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            in your environment (and in Vercel) to render the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <div className="absolute inset-0 print:hidden">
        <APIProvider apiKey={GOOGLE_KEY}>
          <Map
            defaultCenter={TEXAS_CENTER}
            defaultZoom={TEXAS_ZOOM}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
            onClick={() => setSelected(null)}
          >
            <MapController
              mapTypeId={MAP_TYPES[mapTypeIndex].id}
              onBounds={setBounds}
              registerControls={registerControls}
            />
            <MarkersLayer
              features={filtered}
              visible={layerMode === "pins"}
              onSelect={flyToFeature}
            />
            <HeatLayer features={filtered} visible={layerMode === "heatmap"} />
          </Map>
        </APIProvider>
      </div>

      <div className="print:hidden">
        <HeaderBar stats={stats} period={DATA_PERIOD} />
        <div className="absolute right-3 top-2.5 z-40 md:right-4">
          <BriefButton />
        </div>
      </div>

      <div className="print:hidden">
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
          onPolygon={() => {}}
          onRadius={() => {}}
        />
      </div>

      <div
        className="absolute z-20 flex flex-col gap-2 print:hidden
          inset-x-2 bottom-2 max-h-[52vh]
          md:inset-x-auto md:left-auto md:right-4 md:top-[68px] md:bottom-4 md:w-80 md:max-h-none md:gap-3"
      >
        <LegendFilter
          active={activeBuckets}
          counts={counts}
          onToggle={toggleBucket}
          onReset={() => setActiveBuckets(new Set(ALL_BUCKETS))}
          layerMode={layerMode}
        />
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
        <div className="flex shrink-0 gap-1 rounded-2xl bg-white/95 p-1 shadow-card ring-1 ring-black/5 backdrop-blur">
          {([
            ["list", "Properties"],
            ["markets", "Markets"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRightTab(id)}
              className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                rightTab === id
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
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
            searchInputRef={searchInputRef}
            onClear={resetAll}
            hasFilters={hasFilters}
          />
        ) : (
          <MarketPanel rows={marketRows} onSelectMarket={selectMarket} />
        )}
      </div>

      <div className="print:hidden">
        <ZoomControls
          bearing={0}
          onZoomIn={() => controls.current?.zoomIn()}
          onZoomOut={() => controls.current?.zoomOut()}
          onResetNorth={() => controls.current?.resetNorth()}
        />
      </div>

      {selected && (
        <PropertyCard
          hotel={selected.properties}
          onClose={() => setSelected(null)}
        />
      )}

      {dataError && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs text-white shadow-card print:hidden">
          No hotel data loaded yet — run{" "}
          <code className="font-mono">npm run build-data</code> to generate
          public/hotels.geojson.
        </div>
      )}

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PrintBrief stats={stats} topRows={briefRows} period={DATA_PERIOD} />
      <Coachmark />
    </div>
  );
}
