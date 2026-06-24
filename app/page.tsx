import dynamic from "next/dynamic";
import MapSkeleton from "@/components/MapSkeleton";

// The map (Google Maps + deck.gl) touches `window` on import, so it's client-only.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <MapView />
    </main>
  );
}
