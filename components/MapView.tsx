"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
  type CircleLayer,
  type SymbolLayer,
  type HeatmapLayer,
} from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  Bucket,
  HotelCollection,
  HotelProperties,
} from "@/lib/types";
import ToolRail, { LayerMode } from "./ToolRail";
import ZoomControls from "./ZoomControls";
import LegendFilter from "./LegendFilter";
import PropertyCard from "./PropertyCard";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const TEXAS_CENTER = { longitude: -99.3, latitude: 31.3, zoom: 5.5 };

const MAP_TYPES = [
  { label: "Light", style: "mapbox://styles/mapbox/light-v11" },
  { label: "Streets", style: "mapbox://styles/mapbox/streets-v12" },
  { label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
] as const;

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

// ---- Layer styles --------------------------------------------------------

const clusterLayer: CircleLayer = {
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

const clusterCountLayer: SymbolLayer = {
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

const unclusteredLayer: CircleLayer = {
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
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      3.5,
      10,
      6,
      14,
      9,
    ],
    "circle-stroke-width": 1.2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.95,
  },
};

const heatmapLayer: HeatmapLayer = {
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
  const [selected, setSelected] = useState<HotelProperties | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("pins");
  const [mapTypeIndex, setMapTypeIndex] = useState(0);
  const [activeBuckets, setActiveBuckets] = useState<Set<Bucket>>(
    new Set(ALL_BUCKETS)
  );
  const [bearing, setBearing] = useState(0);

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

  const interactiveLayerIds =
    layerMode === "pins" ? ["clusters", "unclustered-point"] : [];

  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
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
          src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            map?.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [
                number,
                number
              ],
              zoom,
              duration: 500,
            });
          });
        }
        return;
      }
      // Individual hotel: open the property card.
      if (feature.layer?.id === "unclustered-point") {
        setSelected(feature.properties as unknown as HotelProperties);
        map_flyTo(mapRef, feature.geometry as GeoJSON.Point);
      }
    },
    []
  );

  const toggleBucket = (b: Bucket) =>
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      // Never allow an empty selection — fall back to all.
      if (next.size === 0) return new Set(ALL_BUCKETS);
      return next;
    });

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#eceff1] p-8">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-gray-900">
            Mapbox token missing
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Set <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in your environment (and in Vercel project settings) to render the
            map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={TEXAS_CENTER}
        mapStyle={MAP_TYPES[mapTypeIndex].style}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onMove={(e) => setBearing(e.viewState.bearing)}
        cursor="auto"
        attributionControl={true}
        style={{ width: "100%", height: "100%" }}
      >
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

      <LegendFilter
        active={activeBuckets}
        counts={counts}
        onToggle={toggleBucket}
        onReset={() => setActiveBuckets(new Set(ALL_BUCKETS))}
        layerMode={layerMode}
      />

      <ZoomControls
        bearing={bearing}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onResetNorth={() =>
          mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })
        }
      />

      {selected && layerMode === "pins" && (
        <PropertyCard hotel={selected} onClose={() => setSelected(null)} />
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
