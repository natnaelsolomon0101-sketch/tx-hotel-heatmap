import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "TX Hotel RevPAR Intelligence",
  description:
    "Interactive RevPAR map of 10,000+ Texas hotels, built from Texas Comptroller hotel occupancy tax data. Filter, search, and export by market and performance.",
  applicationName: "TX Hotel RevPAR Intelligence",
  openGraph: {
    title: "TX Hotel RevPAR Intelligence",
    description:
      "Interactive RevPAR map of 10,000+ Texas hotels — filter, search, and export by market and performance.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TX Hotel RevPAR Intelligence",
    description:
      "Interactive RevPAR map of 10,000+ Texas hotels — filter, search, and export.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#eceff1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
