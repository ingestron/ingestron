import type { StructuredData } from "fumadocs-core/mdx-plugins";
import { createFromSource } from "fumadocs-core/search/server";
import { extraStructure, searchTitle } from "@/lib/search";
import { source } from "@/lib/source";

// Exported once at build time as a static search index. Reference rendered
// from code is added to its page's entries, so error codes and settings are found.
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source, {
  language: "english",
  buildIndex(page) {
    const own = page.data.structuredData as StructuredData;
    const extra = extraStructure(page.url);
    return {
      title: searchTitle(page.url, page.data.title ?? page.url),
      description: page.data.description,
      url: page.url,
      id: page.url,
      structuredData: {
        headings: [...own.headings, ...extra.headings],
        contents: [...own.contents, ...extra.contents],
      },
    };
  },
});
