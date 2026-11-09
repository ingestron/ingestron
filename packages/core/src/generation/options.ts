// What a project is generated with, when it is not the defaults.
import type { Pack } from "@ingestron/definitions";

/** The packs and host values a project is generated with. */
export interface ProjectOptions {
  /** The packs a standard may name. Default: the built-in packs. */
  packs?: readonly Pack[];
  /** The values `${envvar:…}` reads, as the host's environment. Default: `process.env`. */
  envvars?: Readonly<Record<string, string | undefined>>;
}
