// The samples in <repo>/samples, read at build time: starters to create a
// project from, and guides that each show one idea. What each uses comes from
// resolving it, through the CLI, so pages, `ingestron init` and VS Code agree.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { listSamples, sampleFacts, type Sample, type SampleFacts } from "@ingestron/cli";

/** What a page needs to list a sample. */
export interface ExampleInfo extends Sample {
  facts: SampleFacts;
  /** The `ingestron init --template` name, for a starter. */
  template?: string;
}

/** Every sample, starters first; from <repo>/samples whichever folder the build runs in. */
export function listExamples(): ExampleInfo[] {
  return listSamples().map((sample) => ({
    ...sample,
    facts: sampleFacts(sample.folder),
    ...(sample.kind === "starter" && { template: sample.name }),
  }));
}

/** A sample's folder, by its name. Throws for a name that is not a sample. */
export function exampleFolder(name: string): string {
  const found = listSamples().find((sample) => sample.name === name);
  if (!found) throw new Error(`No sample "${name}".`);
  return found.folder;
}

/** The text of one file of a sample. Throws when the file is missing or outside the sample. */
export function readExampleFile(name: string, file: string): string {
  const folder = exampleFolder(name);
  const path = resolve(folder, file);
  if (relative(folder, path).startsWith("..")) {
    throw new Error(`Example "${name}": "${file}" is outside the example.`);
  }
  if (!existsSync(path)) throw new Error(`Example "${name}" has no file "${file}".`);
  return readFileSync(path, "utf8");
}

/** The files of a sample that are committed to the repository, relative to the sample. */
export function exampleFiles(name: string): string[] {
  const folder = exampleFolder(name);
  return execFileSync("git", ["ls-files", "-z", "."], { cwd: folder, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .sort();
}
