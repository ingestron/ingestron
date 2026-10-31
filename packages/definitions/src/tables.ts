// Layers and full names shared by flow and transform tables.
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import type { FullName, ResolvedTable } from "./model.js";
import { namePatterns, renderName, type NameVariables, type Pattern } from "./naming.js";
import type { Naming } from "./pack.js";

/** Layer lookups and the name patterns, prepared once per resolution. */
export interface TableNamer {
  layers: string[];
  patterns: Record<keyof Naming, Pattern>;
  /** The named layer, or the default at `position`; undefined after reporting an unknown one. */
  layerOf(named: string | undefined, position: number, at: Source): string | undefined;
}

/** Prepares layers and patterns. */
export function createNamer(context: Context): TableNamer {
  const layers = context.standard.value.layers ?? context.pack.defaults.layers;
  return {
    layers,
    patterns: namePatterns(context),
    layerOf(named, position, at) {
      if (named === undefined) return layers[Math.min(position, layers.length - 1)];
      if (layers.includes(named)) return named;
      context.reporter.error(
        "UNKNOWN_LAYER",
        `"${named}" is not one of the standard's layers.`,
        at,
        `Layers: ${layers.join(", ")}.`,
      );
      return undefined;
    },
  };
}

/** Catalog, schema and table names for one table. */
export function renderTableName(
  context: Context,
  namer: TableNamer,
  table: Omit<NameVariables, "project" | "environment">,
): FullName | undefined {
  const variables = { project: context.project.id, environment: context.environment, ...table };
  const catalog = renderName(context, namer.patterns.catalog, variables);
  const schema = renderName(context, namer.patterns.schema, variables);
  const name = renderName(context, namer.patterns.table, variables);
  return catalog && schema && name ? { catalog, schema, table: name } : undefined;
}

/** Text form of a full name. */
export function fullNameText(name: FullName): string {
  return `${name.catalog}.${name.schema}.${name.table}`;
}

/** Reports tables whose full names are the same; `atOf` gives each table's location. */
export function checkDuplicateNames(
  context: Context,
  tables: ResolvedTable[],
  atOf: (table: ResolvedTable) => Source | undefined,
): void {
  const seen = new Map<string, ResolvedTable>();
  for (const table of tables) {
    const text = fullNameText(table.fullName);
    const earlier = seen.get(text);
    if (earlier) {
      context.reporter.error(
        "DUPLICATE_NAME",
        `"${table.name}" and "${earlier.name}" would both be ${text}.`,
        atOf(table),
        "Change a name pattern or a table name.",
      );
    }
    seen.set(text, table);
  }
}
