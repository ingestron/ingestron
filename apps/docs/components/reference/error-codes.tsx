// Every code Ingestron reports, with its meaning and fix from the code, each
// with an anchor that problems in the editor link to.
import { codeHelp, loadingCodeHelp } from "@ingestron/definitions";
import { Inline } from "./inline";

/** One heading per code the definitions report. */
export function ErrorCodes() {
  return <Codes entries={Object.entries(codeHelp)} level="h3" />;
}

/** The codes found while loading files, grouped by when they are found. */
export function LoadingCodes() {
  const entries = Object.entries(loadingCodeHelp);
  const stages = [...new Set(entries.map(([, help]) => help.stage))];
  return (
    <>
      {stages.map((stage) => (
        <section key={stage}>
          <h3>{stage}</h3>
          <Codes entries={entries.filter(([, help]) => help.stage === stage)} level="h4" />
        </section>
      ))}
    </>
  );
}

function Codes({
  entries,
  level: Heading,
}: {
  entries: [string, { meaning: string; fix: string }][];
  level: "h3" | "h4";
}) {
  return (
    <>
      {entries.map(([code, help]) => (
        <section key={code}>
          <Heading id={code}>
            <code>{code}</code>
          </Heading>
          <p>
            <Inline text={help.meaning} />
          </p>
          <p>
            <strong>Fix:</strong> <Inline text={help.fix} />
          </p>
        </section>
      ))}
    </>
  );
}
