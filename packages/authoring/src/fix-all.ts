// Fix all: every problem of one code fixed by one action, each with its first
// fix, and an edit that several problems share made once.
import { problems } from "./diagnostics.js";
import { positioned, type QuickFix } from "./fixes.js";
import type { Project } from "./project.js";

/** One fix for every problem with `code` that has a fix, when there are two or more. */
export function fixAll(
  project: Project,
  environment: string | undefined,
  code: string,
): QuickFix[] {
  const fixable = problems(project, environment).filter(
    (problem) => problem.code === code && (problem.fixes?.length ?? 0) > 0,
  );
  if (fixable.length < 2) return [];
  const seen = new Set<string>();
  const edits = fixable
    .flatMap((problem) => positioned(project, problem.fixes![0]!))
    .filter((edit) => {
      const key = JSON.stringify(edit);
      return !seen.has(key) && Boolean(seen.add(key));
    });
  // Two different edits of one place would conflict: give none rather than a wrong one.
  const places = new Set(edits.map((edit) => `${edit.file}:${JSON.stringify(edit.range)}`));
  if (edits.length === 0 || places.size !== edits.length) return [];
  return [{ title: `Fix all ${fixable.length} ${code} problems`, edits }];
}
