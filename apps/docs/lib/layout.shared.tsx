import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="docs-brand">
          ingestron <span>docs</span>
        </span>
      ),
      url: "/docs",
    },
  };
}
