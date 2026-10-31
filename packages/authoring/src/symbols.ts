// The project's named things: tables, documents and values, where each is
// defined, for "Go to Symbol in Workspace" and a file's outline.
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";

/** One named thing and where it is defined. */
export interface ProjectSymbol {
  name: string;
  /** `table`, `value`, or the document's kind, such as `Flow`. */
  kind: string;
  file: string;
  range: [number, number];
}

/** Every definition in the project, a transform named once (as a transform, not also as its table). */
export function projectSymbols(project: Project): ProjectSymbol[] {
  const definitions = occurrences(project).filter((item) => item.definition);
  const transforms = new Set(
    definitions
      .filter((item) => item.symbol.startsWith("doc:Transform:"))
      .map((item) => `${item.file}:${item.range[0]}`),
  );
  return definitions
    .filter(
      (item) => item.symbol.startsWith("doc:") || !transforms.has(`${item.file}:${item.range[0]}`),
    )
    .flatMap(({ symbol, file, range }) => {
      const [kind, ...rest] = symbol.split(":");
      if (kind === "doc") return [{ name: rest.slice(1).join(":"), kind: rest[0]!, file, range }];
      if (kind === "table" || kind === "value")
        return [{ name: rest.join(":"), kind, file, range }];
      return [];
    });
}
