"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

import {
  Bucket,
  BUCKET_COLORS,
  HotelCollection,
  HotelFeature,
  HotelProperties,
} from "@/lib/types";
import ToolRail, { LayerMode } from "./ToolRail";
import ZoomControls from "./ZoomControls";
import LegendFilter from "./LegendFilter";
import PropertyCard from "./PropertyCard";
import PropertyList, { featureKey } from "./PropertyList";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const TEXAS_CENTER = { lat: 31.3, lng: -99.3 };
const TEXAS_ZOOM = 5.5;
const LIST_LIMIT = 200;
const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

const MAP_TYPES = [
  { label: "Roadmap", id: "roadmap" },
  { label: "Satellite", id: "hybrid" },
  { label: "Terrain", id: "terrain" },
] as const;

// ---------------------------------------------------------------------------
// Markers + clustering layer (classic markers, colored by RevPAR bucket).
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
  const clustererRef = useRef<MarkerClusterer | null>(null);

  useEffect(() => {
    if (!map || !window.google) return;

    if (!visible) {
      clustererRef.current?.clearMarkers();
      return;
    }

    const markers = features.map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const marker = new google.maps.Marker({
        position: { lat, lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: BUCKET_COLORS[f.properties.bucket],
          fillOpacity: 0.95,
          scale: 5,
          strokeColor: "#ffffff",
          strokeWeight: 1.2,
        },
      });
      marker.addListener("click", () => onSelect(f));
      return marker;
    });

    const clusterer = new MarkerClusterer({ map, markers });
    clustererRef.current = clusterer;

    return () => {
      clusterer.clearMarkers();
      markers.forEach((m) => m.setMap(null));
    };
  }, [map, features, visible, onSelect]);

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
  // HeatmapLayer typing through the loader is unreliable; use a loose ref.
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
  const [data, setData] = useState<HotelCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HotelFeature | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("pins");
  const [mapTypeIndex, setMapTypeIndex] = useState(0);
  const [activeBuckets, setActiveBuckets] = useState<Set<Bucket>>(
    new Set(ALL_BUCKETS)
  );
  const [bounds, setBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo<HotelFeature[]>(() => {
    if (!data) return [];
    if (activeBuckets.size === ALL_BUCKETS.length) return data.features;
    return data.features.filter((f) => activeBuckets.has(f.properties.bucket));
  }, [data, activeBuckets]);

  const listData = useMemo(() => {
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
    const sorted = [...feats].sort(
      (a, b) => (b.properties.revpar ?? -1) - (a.properties.revpar ?? -1)
    );
    return { rows: sorted.slice(0, LIST_LIMIT), total: sorted.length };
  }, [filtered, bounds, query]);

  const flyToFeature = useCallback((f: HotelFeature) => {
    setSelected(f);
    const [lng, lat] = f.geometry.coordinates;
    controls.current?.flyTo(lng, lat);
  }, []);

  const toggleBucket = (b: Bucket) =>
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      if (next.size === 0) return new Set(ALL_BUCKETS);
      return next;
    });

  const selectedKey = selected ? featureKey(selected) : null;
  const registerControls = useCallback((api: typeof controls.current) => {
    controls.current = api;
  }, []);

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

      <ToolRail
        layerMode={layerMode}
        mapTypeLabel={MAP_TYPES[mapTypeIndex].label}
        onLocate={() => controls.current?.recenter()}
        onToggleLayers={() => {
          setSelected(null);
          setLayerMode((m) => (m === "pins" ? "heatmap" : "pins"));
        }}
        onCycleMapType={() => setMapTypeIndex((i) => (i + 1) % MAP_TYPES.length)}
        onPolygon={() => {}}
        onRadius={() => {}}
      />

      <div
        className="absolute z-20 flex flex-col gap-2
          inset-x-2 bottom-2 max-h-[52vh]
          md:inset-x-auto md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-80 md:max-h-none md:gap-3"
      >
        <LegendFilter
          active={activeBuckets}
          counts={counts}
          onToggle={toggleBucket}
          onReset={() => setActiveBuckets(new Set(ALL_BUCKETS))}
          layerMode={layerMode}
        />
        <PropertyList
          rows={listData.rows}
          total={listData.total}
          limit={LIST_LIMIT}
          query={query}
          onQuery={setQuery}
          onSelect={flyToFeature}
          selectedKey={selectedKey}
        />
      </div>

      <ZoomControls
        bearing={0}
        onZoomIn={() => controls.current?.zoomIn()}
        onZoomOut={() => controls.current?.zoomOut()}
        onResetNorth={() => controls.current?.resetNorth()}
      />

      {selected && (
        <PropertyCard
          hotel={selected.properties}
          onClose={() => setSelected(null)}
        />
      )}

      {dataError && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs text-white shadow-card">
          No hotel data loaded yet — run{" "}
          <code className="font-mono">npm run build-data</code> to generate
          public/hotels.geojson.
        </div>
      )}
    </div>
  );
}
