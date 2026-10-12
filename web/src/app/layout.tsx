import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { serverConfig } from "@/lib/config";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "Saathi — the AI workspace that remembers", template: "%s · Saathi" },
  description:
    "Team chat with a personal AI assistant that finds any file or message, catches you up, and turns promises made in conversation into tracked tasks. Built on Google Cloud.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read configuration at request time (Cloud Run env vars) instead of baking it into the build.
  await connection();
  const config = JSON.stringify(serverConfig()).replace(/</g, "\\u003c");
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&family=Inter:wght@300..800&family=Geist+Mono:wght@100..900&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: `window.__SAATHI__=${config};` }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
