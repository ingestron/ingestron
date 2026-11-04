// Help for the codes of building every environment together (specification sections
// 1, 1.1 and 2.1), shown on the documentation site with the others.
import type { DefinitionCode } from "./diagnostics.js";

type EnvironmentCode =
  | "PACK_VERSION"
  | "ENVIRONMENTS_DIFFER"
  | "DEPLOY_VALUE"
  | "ARM_PARAMETERS"
  | "SECRET_NAME_DIFFERS";

/** What each code means and how to fix it. */
export const environmentCodeHelp: Record<
  Extract<DefinitionCode, EnvironmentCode>,
  { meaning: string; fix: string }
> = {
  PACK_VERSION: {
    meaning:
      "The standard names version 1 of a pack that is now version 2, which builds every environment into one output folder.",
    fix: "Change the standard's packs list to version 2, and read the upgrade notes for what changes in the generated files.",
  },
  ENVIRONMENTS_DIFFER: {
    meaning:
      "The pack builds every environment into one artefact, and the environments differ in more than values, such as a table built in some environments only or a method that differs.",
    fix: "Make the definitions the same in every environment, varying only values such as names, paths and hosts.",
  },
  DEPLOY_VALUE: {
    meaning:
      "A ${envvar:…} supplied only when deploying is where it cannot be: where it would choose or name what is generated; where two environments use different variable names at the same place; or inside a longer text where the platform's parameter must be the whole value, as in Data Factory's ARM parameters and Synapse's SQLCMD variables.",
    fix: "Write the value in project.yaml, per environment; use one variable name in every environment and give it a different value in each pipeline stage; or make the variable hold the whole value. Keep ${envvar:…} for values such as hosts, paths and accounts.",
  },
  ARM_PARAMETERS: {
    meaning:
      "The factory's ARM template would have more than 256 parameters; the message counts them.",
    fix: "Make fewer values differ between environments, or split the definitions into more than one factory.",
  },
  SECRET_NAME_DIFFERS: {
    meaning: "A Key Vault secret's name differs between environments. A warning.",
    fix: "Give the secret the same name in every environment's Key Vault, so that only the vault differs.",
  },
};
