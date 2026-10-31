// Download cards describe the same resolved samples that the archive builder uses.
import { listExamples, type ExampleInfo } from "@/lib/examples";

/** Matching downloadable projects, with their platforms and connector scope.
 * @example <ExamplesList connector="sqlserver" />
 */
export function ExamplesList({
  connector,
  feature,
  kind,
}: {
  connector?: string;
  feature?: string;
  kind?: ExampleInfo["kind"];
}) {
  const examples = listExamples().filter(
    (example) =>
      (!connector || example.facts.connectors.includes(connector)) &&
      (!feature || example.facts.features.includes(feature)) &&
      (!kind || example.kind === kind),
  );
  if (examples.length === 0) throw new Error(`No example for ${connector ?? feature}.`);
  return (
    <div className="example-downloads">
      {examples.map((example) => (
        <Download key={example.name} example={example} />
      ))}
    </div>
  );
}

function Download({ example }: { example: ExampleInfo }) {
  const { name, title, summary, facts } = example;
  return (
    <section className="example-download" aria-label={title}>
      <div className="setting-heading">
        <h3>{title}</h3>
        <span className="setting-meta">ZIP project</span>
      </div>
      <p>{summary}</p>
      <p className="setting-meta">
        {facts.packs
          .map((pack) => (pack === "adf" ? "Azure Data Factory" : "Databricks"))
          .join(" + ")}
        {" · "}
        {facts.connectors.length > 1
          ? `Multi-connector project (${facts.connectors.length} connector types)`
          : `${facts.connectors[0]} project`}
      </p>
      <p>
        Includes project definitions, contracts and generated output. File previews use these same
        sample files.
      </p>
      <a
        className="download-button"
        download
        href={`/downloads/${name}.zip`}
        aria-label={`Download ${title} project ZIP`}
      >
        ↓ Download project ZIP
      </a>
      <span className="download-filename">{name}.zip</span>
    </section>
  );
}
