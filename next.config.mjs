/** @type {import('next').NextConfig} */
const nextConfig = {
  // StrictMode double-mounts components in dev/React 18. react-map-gl + maplibre
  // can't survive the remount (corrupts the WebGL transform -> "failed to invert
  // matrix"), so we keep it off. The map is the whole app here.
  reactStrictMode: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
