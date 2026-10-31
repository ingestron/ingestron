import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      tabs={false}
      sidebar={{
        banner: (
          <nav
            key="documentation-shortcuts"
            className="docs-shortcuts"
            aria-label="Documentation shortcuts"
          >
            <a href="/docs/start">Start here</a>
            <a href="/docs/how-to">Guides</a>
            <a href="/docs/concepts/yaml-references">YAML syntax</a>
          </nav>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
