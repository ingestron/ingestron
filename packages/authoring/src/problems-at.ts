// The problems on the cursor's line, explained for the Reference panel: the
// problem's own hint, its code's meaning and fix, and the quick fixes offered.
import { codeHelp, loadingCodeHelp } from "@ingestron/definitions";
import { problems } from "./diagnostics.js";
import { codeDocs } from "./docs.js";
import { quickFixes } from "./fixes.js";
import type { Project } from "./project.js";
import { positionAt } from "./yaml.js";

/** A problem on the cursor's line, explained. */
export interface ProblemEntry {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** The problem's own hint, such as the fields that are allowed. */
  hint?: string;
  meaning?: string;
  fix?: string;
  /** The quick fixes the editor offers for it. */
  fixes: string[];
  docs?: string;
}

/** The problems on the cursor's line, with their meaning, fix and quick fixes. */
export function problemsAt(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): ProblemEntry[] {
  const { line } = positionAt(text, offset);
  const at = { start: { line, character: 0 }, end: { line, character: 0 } };
  const fixes = quickFixes(project, environment, file, at);
  return problems(project, environment)
    .filter((problem) => problem.file === file && problem.range.start.line === line)
    .map((problem) => {
      const help =
        codeHelp[problem.code as keyof typeof codeHelp] ??
        loadingCodeHelp[problem.code as keyof typeof loadingCodeHelp];
      const docs = codeDocs(problem.code);
      return {
        code: problem.code,
        severity: problem.severity,
        message: problem.message.split("\n")[0]!,
        ...(problem.message.includes("\n") && {
          hint: problem.message.slice(problem.message.indexOf("\n") + 1),
        }),
        fixes: fixes.filter((fix) => fix.problem?.code === problem.code).map((fix) => fix.title),
        ...(help && { meaning: help.meaning, fix: help.fix }),
        ...(docs && { docs }),
      };
    });
}
