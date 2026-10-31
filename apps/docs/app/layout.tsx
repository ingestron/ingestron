import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";

import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.ingestron.io"),
  title: {
    default: "Ingestron documentation",
    template: "%s — Ingestron docs",
  },
  description:
    "Generate data platform assets from reviewed definitions and your organisation's standards.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NZ" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ enabled: true }} search={{ options: { type: "static" } }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
