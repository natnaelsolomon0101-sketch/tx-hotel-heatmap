import type { Metadata, Viewport } from "next";
// Geist_Mono is only exported by next/font in Next 15+. This project is on
// Next 14, so we use JetBrains_Mono (a clean, tabular geometric mono) under the
// same --font-mono variable so all downstream `font-mono` consumers are unchanged.
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

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
  themeColor: "#F7F8FA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="font-sans">
        <a href="#main-content" className="skip-link">
          Skip to map
        </a>
        {children}
      </body>
    </html>
  );
}
