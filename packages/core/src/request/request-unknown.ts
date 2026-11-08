// What the platform request cannot work out while a variable is not set: each flow whose
// source is not known, and each table left out because what it is made from holds an unset
// reference (definitions specification, section 1). Only the text of unset references is
// kept, never a resolved value, since a source or a contract may also hold set ones.
import type { Project } from "@ingestron/config";
import { kinds, type ResolvedModel } from "@ingestron/definitions";

/** Why a table is left out: the unset references it is made from, or a left-out table it reads. */
export type LeftOut = { holds: string[] } | { reads: string };

/** What the request leaves out, by flow and by table, in definition order. */
export interface NotKnown {
  /** Each flow whose source is not known, with the unset references its source holds. */
  sources: Map<string, string[]>;
  /** Each table left out of the model, and why. */
  tables: Map<string, LeftOut>;
}

/** What is not known yet; empty when the project has no unset references. */
export function notKnown(project: Project | undefined, model: ResolvedModel): NotKnown {
  const result: NotKnown = { sources: new Map(), tables: new Map() };
  if (!project || project.unsetEnvvars.length === 0) return result;
  const holds = (values: unknown[]) =>
    project.unsetEnvvars.filter((reference) =>
      values.some((value) => typeof value === "string" && value.includes(reference)),
    );
  for (const table of model.tables)
    if (table.sourceNotKnown !== undefined && table.origin.kind === "Flow")
      result.sources.set(table.origin.id, holds([table.sourceNotKnown]));
  const built = new Set(model.tables.map((table) => table.name));
  leftOutFlowTables(project, built, holds, result.tables);
  leftOutTransforms(project, built, holds, result.tables);
  return result;
}

type Holds = (values: unknown[]) => string[];

/** A flow's tables are made from its steps' `uses` and each table's `contract`. */
function leftOutFlowTables(
  project: Project,
  built: Set<string>,
  holds: Holds,
  tables: Map<string, LeftOut>,
): void {
  for (const { value: flow } of project.all(kinds.flow)) {
    const uses = [flow.ingest?.uses, flow.store?.uses, flow.serve?.uses];
    for (const [name, table] of Object.entries(flow.tables)) {
      const references = holds([...uses, table.contract]);
      if (!built.has(name) && references.length > 0) tables.set(name, { holds: references });
    }
  }
}

/** A transform is made from its `uses`, `contract` and `inputs`, and is left out with an input. */
function leftOutTransforms(
  project: Project,
  built: Set<string>,
  holds: Holds,
  tables: Map<string, LeftOut>,
): void {
  let pending = project.all(kinds.transform).filter(({ value }) => !built.has(value.id));
  let found = true;
  while (found) {
    found = false;
    for (const { value } of pending) {
      const { transform, store, serve, contract, inputs } = value;
      const references = holds([transform?.uses, store?.uses, serve?.uses, contract, ...inputs]);
      const reads = inputs.find((input) => tables.has(input));
      if (references.length > 0) tables.set(value.id, { holds: references });
      else if (reads !== undefined) tables.set(value.id, { reads });
      found ||= tables.has(value.id);
    }
    pending = pending.filter(({ value }) => !tables.has(value.id));
  }
}
