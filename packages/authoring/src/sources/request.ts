// The source request for the editor's command: the CLI's `ingestron source request` text, from
// the project's files with open editors read first (spec/cli/sources.md, section 4).
import { sourceRequestFor } from "@ingestron/core/internal";
import { refusedPacks, type Project } from "../project/index.js";
import { stopped } from "../generation/index.js";

/**
 * The source request as Markdown for the environment, and for one connection when it is given;
 * what stops the request, as a code block, when a pack cannot be loaded.
 */
export function sourceRequest(
  project: Project,
  environment: string | undefined,
  connection?: string,
): string {
  const refused = refusedPacks();
  return refused
    ? stopped(refused)
    : sourceRequestFor(project.files, environment, { ...(connection && { connection }) }).text;
}
