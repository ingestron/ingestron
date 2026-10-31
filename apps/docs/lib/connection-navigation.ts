// Native folder labels open section landing pages; grouping keeps long catalogues compact.
import type { Folder, Node } from "fumadocs-core/page-tree";

/** Keep connections in the global tree, grouped by their existing metadata headings.
 * @example loader({ pageTree: { transformers: [connectionNavigation] }, ...options })
 */
export const connectionNavigation = {
  folder(node: Folder, path: string): Folder {
    const index = node.children.find(
      (child) => child.type === "page" && child.url === `/docs/${path}`,
    );
    const children = node.children.filter((child) => child !== index);
    return {
      ...node,
      index: index?.type === "page" ? index : node.index,
      children: grouped(path) ? groupSections(children, path) : children,
    };
  },
};

function groupSections(nodes: Node[], path: string): Node[] {
  const children: Node[] = [];
  let group: Folder | undefined;
  for (const [index, node] of nodes.entries()) {
    if (node.type === "separator") {
      group = {
        type: "folder",
        $id: `navigation:${path}:${index}`,
        name: node.name,
        defaultOpen: false,
        children: [],
      };
      children.push(group);
    } else {
      if (group && node.type === "page" && !group.index) {
        group.index = node;
        if (path === "connectors" || path === "how-to") continue;
      }
      (group?.children ?? children).push(node);
    }
  }
  return children;
}

function grouped(path: string): boolean {
  return path === "connectors" || path === "how-to" || /^connectors\/[^/]+$/.test(path);
}
