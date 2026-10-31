export const dynamic = "force-static";

import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://docs.ingestron.io/sitemap.xml",
    host: "https://docs.ingestron.io",
  };
}
