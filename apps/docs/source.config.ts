import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({ dir: "content/docs" });
export default defineConfig({
  mdxOptions: {
    remarkStructureOptions: {
      // Search the prose, not navigation component attributes.
      types: ["heading", "paragraph", "blockquote", "tableCell"],
    },
  },
});
