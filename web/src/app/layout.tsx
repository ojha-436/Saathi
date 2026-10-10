import type { Metadata, Viewport } from "next";
import { Geist_Mono, Montserrat } from "next/font/google";
import { connection } from "next/server";
import { serverConfig } from "@/lib/config";
import "./globals.css";

// Self-hosted at build time: no request to Google Fonts at runtime (the CSP only allows our own origin for fonts/styles)
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], style: ["normal", "italic"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });


export const metadata: Metadata = {
  title: { default: "Saathi — the AI workspace that remembers", template: "%s · Saathi" },
  description:
    "Team chat with a personal AI assistant that finds any file or message, catches you up, and turns promises made in conversation into tracked tasks. Built on Google Cloud.",
  // Installed on iPhone/iPad from Safari → Share → Add to Home Screen (needed for web push on iOS)
  appleWebApp: { capable: true, title: "Saathi", statusBarStyle: "default" },
  icons: { apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#efeae9" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read configuration at request time (Cloud Run env vars) instead of baking it into the build.
  await connection();
  const config = JSON.stringify(serverConfig()).replace(/</g, "\\u003c");
  return (
    <html lang="en" className={`${montserrat.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `window.__SAATHI__=${config};` }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
