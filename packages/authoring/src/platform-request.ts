// The platform request and the environment comparison for the editor's
// commands: the CLI's `ingestron request` and `ingestron compare` text, from
// the project's files with open editors read first.
import { compareEnvironments as compare, platformRequest as request } from "@ingestron/cli";
import type { Project } from "./project.js";

/** The request as Markdown for the environment, as `ingestron request` prints it. */
export function platformRequest(project: Project, environment: string | undefined): string {
  return request(project.files, environment);
}

/** What differs between two environments, as `ingestron compare` prints it. */
export function compareEnvironments(project: Project, a: string, b: string): string {
  return compare(project.files, a, b);
}
