// Chapter-sized slices of the existing reference, without copying its facts.
import { ingestionRows } from "@/lib/connector-settings";
import type { FieldInfo } from "@ingestron/definitions";
import { anchorId, fieldPath, settingRows, shown } from "@/lib/reference";
import { Meaning } from "./field-rows";

const homes = {
  platform: "platform settings",
  standard: "standard settings",
  definition: "the flow's ingest.with",
};

/** Explain method settings as sections. Prefixes include nested fields.
 * @example <SettingsSections pack="adf" method="adf-copy" include={["mode", "watermark_column"]} />
 */
export function SettingsSections({
  pack,
  method,
  include,
  connector,
  exclude = [],
}: {
  pack: string;
  method: string;
  include?: string[];
  connector?: string;
  exclude?: string[];
}) {
  const available = connector ? ingestionRows(connector, pack) : settingRows(pack, method);
  const rows = available.filter((field) => {
    const path = fieldPath(field);
    const matches = (prefix: string) => path === prefix || path.startsWith(`${prefix}.`);
    return (!include || include.some(matches)) && !exclude.some(matches);
  });
  return (
    <div className="setting-sections">
      <SettingPlacement fields={rows} />
      {rows.length > 3 && <SettingLinks fields={rows} />}
      {rows.map((field) => (
        <SettingSection key={field.docs} field={field} />
      ))}
    </div>
  );
}

function SettingSection({ field }: { field: FieldInfo }) {
  return (
    <section id={anchorId(field)}>
      <header className="setting-heading">
        <h3>
          <a href={`#${anchorId(field)}`}>
            <code>{fieldPath(field)}</code>
          </a>
        </h3>
        <span className="setting-meta">
          {field.required && "Required"}
          {field.default !== undefined && (
            <>
              {" "}
              {field.required && " · "}Default: <code>{shown(field.default)}</code>
            </>
          )}
        </span>
      </header>
      <div>
        <Meaning field={field} />
      </div>
    </section>
  );
}

function SettingLinks({ fields }: { fields: FieldInfo[] }) {
  return (
    <ul aria-label="Settings in this section">
      {fields.map((field) => (
        <li key={field.docs}>
          <a href={`#${anchorId(field)}`}>
            <code>{fieldPath(field)}</code>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SettingPlacement({ fields }: { fields: FieldInfo[] }) {
  const places = [...new Set(fields.map((field) => field.placement))]
    .filter((home) => home !== undefined)
    .map((home) => homes[home!]);
  return (
    <p className="setting-meta">
      Configure these fields in {places.join(" or ")}. See{" "}
      <a href="/docs/concepts/settings">how settings are resolved</a> for overrides.
    </p>
  );
}
