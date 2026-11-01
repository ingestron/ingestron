// Data products (specification section 8): ODPS documents that publish the
// tables built from their output ports' contracts.
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { kinds, type ProductDoc } from "./documents.js";
import type { ResolvedProduct, ResolvedTable } from "./model.js";

type ProductDocument = DefinitionDocument<ProductDoc>;

/** Each product, by id, after reporting the problems in its output ports. */
export function resolveProducts(context: Context, tables: ResolvedTable[]): ResolvedProduct[] {
  const documents = [
    ...context.project.all(kinds.product),
    ...context.project.all(kinds.productV1),
  ].sort((a, b) => a.file.localeCompare(b.file));
  const named = namedContracts(context);
  const publisher = new Map<string, string>();
  const products: ResolvedProduct[] = [];
  const seen = new Set<string>();
  for (const document of documents) {
    if (seen.has(document.value.id)) {
      context.reporter.error(
        "DUPLICATE_PRODUCT",
        `Another file already defines the data product "${document.value.id}".`,
        { document, pointer: "/id" },
      );
      continue;
    }
    seen.add(document.value.id);
    products.push(productOf(document, outputsOf(context, document, tables, named, publisher)));
  }
  return products.sort((a, b) => a.id.localeCompare(b.id));
}

/** The contracts a flow table or a transform names, whatever the environment builds. */
function namedContracts(context: Context): Set<string> {
  const flows = context.project
    .all(kinds.flow)
    .flatMap((flow) => Object.values(flow.value.tables ?? {}).map((table) => table.contract));
  const transforms = context.project.all(kinds.transform).map((item) => item.value.contract);
  return new Set([...flows, ...transforms].filter((id): id is string => typeof id === "string"));
}

interface PortFacts {
  product: string;
  contract: string;
  built: string[];
  at: Source;
}

function outputsOf(
  context: Context,
  document: ProductDocument,
  tables: ResolvedTable[],
  named: Set<string>,
  publisher: Map<string, string>,
): ResolvedProduct["outputs"] {
  const product = document.value.id;
  return (document.value.outputPorts ?? []).flatMap((port, index) => {
    const contract = port.contractId;
    if (!contract) return [];
    const at = { document, pointer: `/outputPorts/${index}/contractId` };
    const built = tables.filter((table) => table.contract.id === contract).map(({ name }) => name);
    reportPort(context, { product, contract, built, at }, named, publisher);
    if (!publisher.has(contract)) publisher.set(contract, product);
    const description = port.description !== undefined && { description: port.description };
    return [{ name: port.name, contract, ...description, tables: built }];
  });
}

/** An output's problem: its contract unused, published twice, or not built here. */
function reportPort(
  context: Context,
  { product, contract, built, at }: PortFacts,
  named: Set<string>,
  publisher: Map<string, string>,
): void {
  if (!named.has(contract))
    context.reporter.error(
      "PRODUCT_CONTRACT_UNUSED",
      `No flow table or transform uses the contract "${contract}", so "${product}" publishes nothing here.`,
      at,
      "Name the contract in a flow's table or a transform, or remove the output port.",
    );
  else if (publisher.has(contract))
    context.reporter.error(
      "PRODUCT_CONTRACT_SHARED",
      `The data product "${publisher.get(contract)}" already publishes the contract "${contract}"; a table has one owner.`,
      at,
    );
  // A table that failed to resolve is missing for that reason, which is reported.
  else if (built.length === 0 && !context.reporter.failed())
    context.reporter.warning(
      "PRODUCT_NOT_BUILT",
      `No table uses the contract "${contract}" in this environment, so "${product}" has nothing to publish for it here.`,
      at,
    );
}

function productOf(
  document: ProductDocument,
  outputs: ResolvedProduct["outputs"],
): ResolvedProduct {
  const { value } = document;
  const team = (value.team?.members ?? []).map(({ username, name, role }) => ({
    username,
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
  }));
  const optional = <K extends keyof ProductDoc>(key: K) =>
    value[key] !== undefined ? { [key]: value[key] } : {};
  const description = value.description ?? {};
  return {
    id: value.id,
    ...optional("name"),
    ...optional("version"),
    ...optional("domain"),
    ...optional("type"),
    ...optional("status"),
    deprecated: value.deprecated === true,
    ...(description.purpose !== undefined && { purpose: description.purpose }),
    ...(description.usage !== undefined && { usage: description.usage }),
    ...(description.limitations !== undefined && { limitations: description.limitations }),
    team,
    owners: team
      .filter((member) => member.role?.toLowerCase() === "owner")
      .map(({ username, name }) => ({ username, ...(name !== undefined && { name }) })),
    support: (value.support ?? []).map(({ channel, url, tool }) => ({
      channel,
      url,
      ...(tool !== undefined && { tool }),
    })),
    outputs,
    file: document.file,
  };
}
