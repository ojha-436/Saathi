import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { connection } from "next/server";
import { serverConfig } from "@/lib/config";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const serif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Saathi — the AI workspace that remembers", template: "%s · Saathi" },
  description:
    "Team chat with a personal AI assistant that finds any file or message, catches you up, and turns promises made in conversation into tracked tasks. Built on Google Cloud.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1b2b" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read configuration at request time (Cloud Run env vars) instead of baking it into the build.
  await connection();
  const config = JSON.stringify(serverConfig()).replace(/</g, "\\u003c");
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `window.__SAATHI__=${config};` }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
