// Every pack the command knows; a project's standard chooses among them.
import type { Pack } from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";

/** The packs available to `ingestron`, by id. */
export const packs: Pack[] = [databricks, adf];
