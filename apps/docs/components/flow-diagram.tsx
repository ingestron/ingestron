// Semantic boxes and arrows stay readable when the diagram stacks on a phone.
/** A short flow diagram, with the same reading order visually and for assistive technology.
 * @example <FlowDiagram title="Ingestion" steps={[{ title: "Source" }, { title: "Databricks" }]} />
 */
export function FlowDiagram({
  title,
  steps,
}: {
  title: string;
  steps: { title: string; detail?: string }[];
}) {
  return (
    <figure className="workflow-diagram">
      <figcaption>{title}</figcaption>
      <ol>
        {steps.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            {step.detail && <span>{step.detail}</span>}
          </li>
        ))}
      </ol>
    </figure>
  );
}
