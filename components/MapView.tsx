"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  AttributionControl,
  type MapRef,
  type MapLayerMouseEvent,
  type LayerProps,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  Bucket,
  HotelCollection,
  HotelFeature,
  HotelProperties,
} from "@/lib/types";
import ToolRail, { LayerMode } from "./ToolRail";
import ZoomControls from "./ZoomControls";
import LegendFilter from "./LegendFilter";
import PropertyCard from "./PropertyCard";
import PropertyList, { featureKey } from "./PropertyList";

const TEXAS_CENTER = { longitude: -99.3, latitude: 31.3, zoom: 5.5 };

// Free, keyless basemaps from CARTO (vector, CORS-enabled). No access token needed.
const MAP_TYPES = [
  { label: "Light", style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  { label: "Streets", style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" },
  { label: "Dark", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
] as const;

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

// Cap how many rows we put in the DOM for the scrollable list (perf).
const LIST_LIMIT = 200;

// ---- Layer styles --------------------------------------------------------

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "hotels",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#cbd5e1",
      25,
      "#94a3b8",
      100,
      "#64748b",
    ],
    "circle-radius": ["step", ["get", "point_count"], 15, 25, 20, 100, 28],
    "circle-opacity": 0.9,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "hotels",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-size": 12,
  },
  paint: { "text-color": "#0f172a" },
};

const unclusteredLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "hotels",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match",
      ["get", "bucket"],
      "red",
      "#ee2233",
      "yellow",
      "#f5b301",
      "gray",
      "#9aa0a6",
      "#9aa0a6",
    ],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 10, 6, 14, 9],
    "circle-stroke-width": 1.2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.95,
  },
};

const heatmapLayer: LayerProps = {
  id: "hotels-heat",
  type: "heatmap",
  source: "hotels-heat",
  paint: {
    "heatmap-weight": [
      "interpolate",
      ["linear"],
      ["get", "revpar"],
      0,
      0,
      500,
      0.4,
      1500,
      0.7,
      4000,
      1,
    ],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 3],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.2,
      "rgba(154,160,166,0.6)",
      0.45,
      "#f5b301",
      0.75,
      "#ff7a18",
      1,
      "#ee2233",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 14, 12, 34],
    "heatmap-opacity": 0.85,
  },
};

// ---- Component -----------------------------------------------------------

export default function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const [data, setData] = useState<HotelCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HotelFeature | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("pins");
  const [mapTypeIndex, setMapTypeIndex] = useState(0);
  const [activeBuckets, setActiveBuckets] = useState<Set<Bucket>>(
    new Set(ALL_BUCKETS)
  );
  const [bearing, setBearing] = useState(0);
  // Current map viewport [west, south, east, north]; drives the property list.
  const [bounds, setBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [query, setQuery] = useState("");

  // Load the geojson the pipeline produced.
  useEffect(() => {
    let cancelled = false;
    fetch("/hotels.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`hotels.geojson ${r.status}`);
        return r.json();
      })
      .then((json: HotelCollection) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setDataError(String(e.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { red: 0, yellow: 0, gray: 0 };
    data?.features.forEach((f) => {
      const b = f.properties.bucket;
      if (b in c) c[b] += 1;
    });
    return c;
  }, [data]);

  // Filter the collection by the active buckets (re-clusters correctly).
  const filtered = useMemo<HotelCollection | null>(() => {
    if (!data) return null;
    if (activeBuckets.size === ALL_BUCKETS.length) return data;
    return {
      type: "FeatureCollection",
      features: data.features.filter((f) =>
        activeBuckets.has(f.properties.bucket)
      ),
    };
  }, [data, activeBuckets]);

  // Heatmap only considers hotels that actually have a RevPAR value.
  const heatData = useMemo<HotelCollection | null>(() => {
    if (!filtered) return null;
    return {
      type: "FeatureCollection",
      features: filtered.features.filter((f) => f.properties.revpar != null),
    };
  }, [filtered]);

  // Properties for the scrollable list: filtered by bucket, then by the current
  // viewport (or by search text), sorted best-RevPAR first.
  const listData = useMemo(() => {
    if (!filtered) return { rows: [] as HotelFeature[], total: 0 };
    const q = query.trim().toLowerCase();
    let feats = filtered.features;
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

  const updateBounds = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    const b = m.getBounds();
    setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }, []);

  const flyToFeature = useCallback((f: HotelFeature) => {
    setSelected(f);
    const map = mapRef.current;
    if (!map) return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 13),
      duration: 700,
    });
  }, []);

  const selectedKey = selected ? featureKey(selected) : null;

  const interactiveLayerIds =
    layerMode === "pins" ? ["clusters", "unclustered-point"] : [];

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setSelected(null);
      return;
    }
    // Cluster: zoom in to expand.
    if (feature.layer?.id === "clusters") {
      const clusterId = feature.properties?.cluster_id;
      const map = mapRef.current?.getMap();
      const src: any = map?.getSource("hotels");
      if (src && clusterId != null) {
        // maplibre-gl v3 returns a Promise.
        Promise.resolve(src.getClusterExpansionZoom(clusterId))
          .then((zoom: number) => {
            map?.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [
                number,
                number
              ],
              zoom,
              duration: 500,
            });
          })
          .catch(() => {});
      }
      return;
    }
    // Individual hotel: open the property card.
    if (feature.layer?.id === "unclustered-point") {
      const hf: HotelFeature = {
        type: "Feature",
        geometry: feature.geometry as GeoJSON.Point,
        properties: feature.properties as unknown as HotelProperties,
      };
      setSelected(hf);
      map_flyTo(mapRef, hf.geometry);
    }
  }, []);

  const toggleBucket = (b: Bucket) =>
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      if (next.size === 0) return new Set(ALL_BUCKETS); // never empty
      return next;
    });

  return (
    <div className="relative h-screen w-screen">
      <Map
        ref={mapRef}
        initialViewState={TEXAS_CENTER}
        mapStyle={MAP_TYPES[mapTypeIndex].style}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onLoad={updateBounds}
        onMoveEnd={updateBounds}
        onMove={(e) => setBearing(e.viewState.bearing)}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <AttributionControl position="top-left" compact />

        {layerMode === "pins" && filtered && (
          <Source
            id="hotels"
            type="geojson"
            data={filtered}
            cluster
            clusterRadius={50}
            clusterMaxZoom={13}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredLayer} />
          </Source>
        )}

        {layerMode === "heatmap" && heatData && (
          <Source id="hotels-heat" type="geojson" data={heatData}>
            <Layer {...heatmapLayer} />
          </Source>
        )}
      </Map>

      <ToolRail
        layerMode={layerMode}
        mapTypeLabel={MAP_TYPES[mapTypeIndex].label}
        onLocate={() =>
          mapRef.current?.flyTo({
            center: [TEXAS_CENTER.longitude, TEXAS_CENTER.latitude],
            zoom: TEXAS_CENTER.zoom,
            duration: 800,
          })
        }
        onToggleLayers={() => {
          setSelected(null);
          setLayerMode((m) => (m === "pins" ? "heatmap" : "pins"));
        }}
        onCycleMapType={() => setMapTypeIndex((i) => (i + 1) % MAP_TYPES.length)}
        onPolygon={() => {}}
        onRadius={() => {}}
      />

      <div className="absolute right-4 top-4 bottom-6 z-20 flex w-72 max-w-[78vw] flex-col gap-3">
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
        bearing={bearing}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onResetNorth={() =>
          mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })
        }
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

function map_flyTo(
  ref: React.MutableRefObject<MapRef | null>,
  geom: GeoJSON.Point
) {
  const [lng, lat] = geom.coordinates as [number, number];
  const map = ref.current;
  if (!map) return;
  const targetZoom = Math.max(map.getZoom(), 11);
  map.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 600 });
}
