import { connectorEntries } from "@/lib/reference";
import { SettingsSections } from "./settings-sections";

/** Show only the native table settings supported by this connector.
 * @example <NativeReadSettings id="rest" />
 */
export function NativeReadSettings({ id }: { id: string }) {
  const entry = connectorEntries(id).find((item) => item.pack === "adf");
  const reading = entry?.connector.reading;
  if (!reading) throw new Error(`No native reading metadata for ${id}`);
  return (
    <>
      <p>
        The landing format is <code>{reading.format}</code>. Set <code>format</code> to that value
        {reading.format === "parquet" ? ", or leave it at the default" : ""}.
      </p>
      <p>
        {reading.query === "unsupported" ? (
          "This connector does not accept a query setting. Use the object and the supported extraction options below."
        ) : (
          <>
            A <code>query</code> in <code>ingest.with</code> is {reading.query}. It selects the data
            for each run; it does not save an incremental watermark.
          </>
        )}
      </p>
      {reading.runtime && (
        <p>
          This source requires <code>runtime_kind: {reading.runtime}</code>. The named integration
          runtime must match.
        </p>
      )}
      {reading.sourceOptions.length === 0 && (
        <p>
          This connector has no <code>source_options</code> settings.
        </p>
      )}
      <SettingsSections pack="adf" method="adf-table" connector={id} />
    </>
  );
}
