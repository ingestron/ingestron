// A project held open: its files, the packs and host values it is generated
// with, and its generation, worked out once and kept until refresh().
import type { FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { planGeneration, type OutputFolder, type Plan } from "@ingestron/generate";
import { compareEnvironments } from "../compare/index.js";
import {
  environmentReportsText,
  generateAll,
  packReportsText,
  type Generated,
  type ProjectOptions,
} from "../generation/index.js";
import { packs as builtInPacks } from "../packs/index.js";
import { requestFor } from "../request/index.js";

/**
 * A project held open. Its generation is worked out on first use and kept, for
 * each way of treating REPLACE_ME, until {@link Project.refresh}; nothing is
 * written. Plan and request use that generation; compare resolves the two
 * environments it is asked about. All use the same files, packs and host
 * values, and the host values are never shown.
 * @example
 * const project = Project.open(nodeFiles("definitions"));
 * const plan = project.plan(nodeFolder("build/duckdb"), "duckdb");
 * @beta
 */
export class Project {
  /** Where the project's definitions are read from. */
  readonly files: FileSource;
  /** The packs the project's standard may name. */
  readonly packs: readonly Pack[];
  // The values `${envvar:…}` reads: private, so logging the project never shows them.
  readonly #envvars: Readonly<Record<string, string | undefined>>;
  readonly #generations = new Map<"warning" | "error", Generated>();

  private constructor(files: FileSource, options: ProjectOptions) {
    this.files = files;
    this.packs = options.packs ?? builtInPacks;
    this.#envvars = options.envvars ?? process.env;
  }

  /** Opens the project whose files `files` reads; `options` gives other packs or host values. */
  static open(files: FileSource, options: ProjectOptions = {}): Project {
    return new Project(files, options);
  }

  /** Every environment resolved and each pack's output; REPLACE_ME is a warning unless `error`, as for check. */
  generation(options: { replaceMe?: "warning" | "error" } = {}): Generated {
    const replaceMe = options.replaceMe ?? "warning";
    const known = this.#generations.get(replaceMe);
    if (known) return known;
    const generated = generateAll(this.files, this.packs, this.#envvars, replaceMe);
    this.#generations.set(replaceMe, generated);
    return generated;
  }

  /**
   * What applying the output named `outputName` to `folder` would change. Throws
   * when the definitions have problems, with them, or for an output the project
   * does not generate.
   */
  plan(folder: OutputFolder, outputName: string): Plan {
    const generated = this.generation();
    if (!generated.ok)
      throw new Error(
        `The definitions have problems:\n${environmentReportsText(generated.environmentReports)}${packReportsText(generated.packReports)}`,
      );
    const output = generated.outputs.find(({ name }) => name === outputName);
    if (!output) throw new Error(`The project generates no output named "${outputName}".`);
    return planGeneration(folder, output.files);
  }

  /** What differs between environments `a` and `b`, as Markdown. */
  compare(a: string, b: string): string {
    return compareEnvironments(this.files, a, b, this.#options());
  }

  /** The platform request for `environment`, or the default, as Markdown, from the kept generation. */
  request(environment?: string): string {
    return requestFor(this.files, environment, this.generation(), this.#options()).text;
  }

  /** Forgets the generation, so the next use reads the files again. */
  refresh(): void {
    this.#generations.clear();
  }

  #options(): ProjectOptions {
    return { packs: this.packs, envvars: this.#envvars };
  }
}
