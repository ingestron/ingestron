// Settings written for a step the table does not have (`SETTINGS_UNUSED`).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import type { FlowDoc } from "./documents.js";

/** Store settings when the flow ends at the landed files (`SETTINGS_UNUSED`). */
export function unusedStoreSettings(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
): void {
  const written = [
    ...(flow.value.store?.with ? ["/store/with"] : []),
    ...(flow.value.tables[name]?.store?.with ? [`/tables/${name}/store/with`] : []),
  ];
  for (const pointer of written)
    context.reporter.warning(
      "SETTINGS_UNUSED",
      "The flow ends at the landed files, so its store settings are not used.",
      { document: flow, pointer },
    );
}
