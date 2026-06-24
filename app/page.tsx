import dynamic from "next/dynamic";

// react-map-gl / mapbox-gl touch `window` on import, so the map must be client-only.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#eceff1] text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <MapView />
    </main>
  );
}
