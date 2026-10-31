// Descriptions and values come from the same metadata as editor help.
import type { Connector } from "@ingestron/definitions";
import { parse } from "yaml";
import { readExampleFile } from "@/lib/examples";
import { connectorEntries, shown } from "@/lib/reference";
import { Inline } from "./inline";

interface Props {
  id: string;
  pack: string;
  sample?: string;
  file?: string;
}

/** Field explanations with values from the displayed, validated sample.
 * @example <ConnectorSettings id="sqlserver" pack="adf" />
 */
export function ConnectorSettings({ id, pack, sample, file }: Props) {
  const connector = connectorEntries(id).find((entry) => entry.pack === pack)?.connector;
  if (!connector) throw new Error(`No ${pack} connector ${id}`);
  const example = sample && file ? parse(readExampleFile(sample, file)).settings : {};
  return (
    <div className="setting-sections" id="settings">
      <p>
        These fields go under <code>settings</code> in the connection YAML. Optional fields may
        become required when you choose a particular authentication option; the conditions are
        described below.
      </p>
      {connector.reading?.runtime && (
        <p>
          This source requires <code>runtime_kind: {connector.reading.runtime}</code> in the
          platform's method settings. Name the matching runtime in <code>integration_runtime</code>.
        </p>
      )}
      <ul aria-label="Connection settings">
        {connector.settings.map((setting) => (
          <li key={setting.name}>
            <a href={`#connection-${setting.name}`}>
              <code>{setting.name}</code>
            </a>
          </li>
        ))}
      </ul>
      {connector.settings.map((setting) => (
        <ConnectionField key={setting.name} setting={setting} example={example?.[setting.name]} />
      ))}
    </div>
  );
}

type Setting = Connector["settings"][number];

function ConnectionField({ setting, example }: { setting: Setting; example: unknown }) {
  return (
    <section id={`connection-${setting.name}`}>
      <header className="setting-heading">
        <h3>
          <a href={`#connection-${setting.name}`}>
            <code>{setting.name}</code>
          </a>
        </h3>
        <span className="setting-meta">
          {!setting.optional && "Required · "}
          {setting.type}
        </span>
      </header>
      <p>
        <Inline text={setting.description} />
      </p>
      <ConnectionValues setting={setting} />
      {example !== undefined && (
        <p>
          In the example: <code>{shown(example)}</code>.
        </p>
      )}
    </section>
  );
}

function ConnectionValues({ setting }: { setting: Setting }) {
  return (
    <>
      {setting.values && (
        <p>
          Accepted values:{" "}
          {setting.values.map((value, index) => (
            <span key={value}>
              {index > 0 && ", "}
              <code>{value}</code>
            </span>
          ))}
          .
        </p>
      )}
      {setting.secret && (
        <p>
          Use a <code>{"${secret:name}"}</code> reference to a Key Vault secret. Keep the secret
          value out of the YAML.
        </p>
      )}
    </>
  );
}
