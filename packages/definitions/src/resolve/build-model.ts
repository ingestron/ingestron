// The resolved model for one environment, once every table resolved
// (specification sections 2 and 11.5).
import type { Context } from "../context/index.js";
import type { ResolvedModel, ResolvedProduct, ResolvedTable } from "../pack/index.js";
import { resolvePlatform } from "../platform/index.js";
import { renderName, type TableNamer } from "../tables/index.js";
import { previewFeaturesOf } from "./judge.js";
import { operationsOf } from "./operations.js";

/** The model, once the project-wide names render; undefined after reporting. */
export function buildModel(
  context: Context,
  namer: TableNamer,
  together: boolean,
  tables: ResolvedTable[],
  products: ResolvedProduct[],
): ResolvedModel | undefined {
  const { project } = context;
  const base = { project: project.id, environment: context.environment };
  const pipeline = renderName(context, namer.patterns.pipeline, base);
  const job = renderName(context, namer.patterns.job, base);
  if (!pipeline || !job) return undefined;
  return {
    project: {
      id: project.id,
      ...(project.name && { name: project.name }),
      environment: context.environment,
    },
    standard: {
      id: context.standard.value.id,
      packs: context.standard.value.packs,
      ...(context.standard.value.governance && { governance: context.standard.value.governance }),
    },
    platform: resolvePlatform(context, together),
    layers: namer.layers,
    names: { pipeline, job },
    tables,
    products,
    previewFeatures: previewFeaturesOf(context, tables),
    operations: operationsOf(context),
    qualityResults: context.standard.value.quality?.results === true,
  };
}
