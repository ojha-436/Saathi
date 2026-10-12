import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { serverConfig } from "@/lib/config";
import "@fontsource-variable/inter";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist-mono";
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
        <script dangerouslySetInnerHTML={{ __html: `window.__SAATHI__=${config};` }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
