import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { projectSources } from "@ingestron/cli";
import { loader, type VirtualFile } from "fumadocs-core/source";
import { findPath, getPageTreeRoots } from "fumadocs-core/page-tree";
import { expect, it } from "vitest";
import { connectionNavigation } from "../lib/connection-navigation.js";
import { connectorEntries, connectorIds } from "../lib/reference.js";

const folder = join(process.cwd(), "content/docs");
const files: VirtualFile[] = readdirSync(folder, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".mdx") || path.endsWith("meta.json"))
  .map((path) => {
    const text = readFileSync(join(folder, path), "utf8");
    return path.endsWith("meta.json")
      ? { type: "meta", path, data: JSON.parse(text) }
      : { type: "page", path, data: parse(text.split("---")[1] ?? "") };
  });
const source = loader({
  baseUrl: "/docs",
  source: { files },
  pageTree: { transformers: [connectionNavigation] },
});
const tree = source.getPageTree();
const pathTo = (url: string) =>
  findPath(tree.children, (node) => node.type === "page" && node.url === url, {
    includeSeparator: false,
  });

it("keeps connection chapters and shared guides under the same global root", () => {
  expect(getPageTreeRoots(tree)).toHaveLength(1);
  expect(pathTo("/docs/connectors/sqlserver/adf-connection")?.map((node) => node.name)).toEqual([
    "Connections",
    "Databases and analytics",
    "SQL Server",
    "Azure Data Factory",
    "Connection and access",
  ]);
  expect(pathTo("/docs/how-to/adf-runtime")?.map((node) => node.name)).toEqual([
    "Guides",
    "Azure Data Factory",
    "ADF runtime and scheduling",
  ]);
});

it("keeps every overview and supported route reachable at its existing URL", () => {
  for (const id of connectorIds()) {
    expect(pathTo(`/docs/connectors/${id}`), id).not.toBeNull();
    for (const { pack } of connectorEntries(id)) {
      for (const chapter of ["connection", "ingestion"]) {
        const path = pathTo(`/docs/connectors/${id}/${pack}-${chapter}`);
        expect(path, `${id}/${pack}-${chapter}`).not.toBeNull();
        expect(path?.filter((node) => node.type === "folder" && node.defaultOpen)).toEqual([]);
      }
    }
  }
});

it("opens landing pages from category and connector folder labels", () => {
  const path = pathTo("/docs/connectors/sqlserver/adf-ingestion")!;
  const folders = path.filter((node) => node.type === "folder");
  expect(folders.map((node) => node.index?.url)).toEqual([
    "/docs/connectors",
    "/docs/connectors/databases-and-analytics",
    "/docs/connectors/sqlserver",
    "/docs/connectors/sqlserver/adf-connection",
  ]);
  expect(pathTo("/docs/connectors/sqlserver/examples")?.map((node) => node.name)).toEqual([
    "Connections",
    "Databases and analytics",
    "SQL Server",
    "Examples",
  ]);
});

it("lists each connector in the category used by the project builder", () => {
  for (const connector of projectSources()) {
    const path = pathTo(`/docs/connectors/${connector.id}`)!;
    expect(path[1]?.name, connector.id).toBe(connector.category);
  }
});

it("opens every main section from its folder label without a duplicate index item", () => {
  for (const name of ["start", "concepts", "how-to", "examples", "reference", "tools"]) {
    const url = `/docs/${name}`;
    const folder = tree.children.find((node) => node.type === "folder" && node.index?.url === url);
    expect(folder?.type).toBe("folder");
    if (folder?.type === "folder")
      expect(folder.children.some((child) => child.type === "page" && child.url === url)).toBe(
        false,
      );
  }
});
