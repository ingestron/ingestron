// README.md's Deploy section: how each output folder is deployed, for one environment at a
// time, what each placeholder is, and the deploy-time values its pack names
// (spec/cli/projects.md, "README.md"). Data Factory comes first: it lands the files the
// others read.
import type { Output } from "./build-outputs.js";

type Deploy = (output: Output, folder: string) => string[];

/** The documentation's page with Data Factory's full deploy steps. */
const adfDeploy = "https://docs.ingestron.io/docs/platforms/adf-deploy";

const sh = (lines: string[]) => ["```sh", ...lines, "```"];
const powershell = (lines: string[]) => ["```powershell", ...lines, "```"];

const adf: Deploy = (_output, folder) => [
  `One factory for every environment, \`${folder}/factory/\`, and a parameter file for each,`,
  `\`${folder}/parameters/<environment>.json\`. Build the ARM template once with Microsoft's`,
  "export, from a `package.json` beside this README, on Node 20 or 22:",
  "",
  "```json",
  "{",
  '  "scripts": { "build": "node node_modules/@microsoft/azure-data-factory-utilities/lib/index" },',
  '  "dependencies": { "@microsoft/azure-data-factory-utilities": "1.0.3" }',
  "}",
  "```",
  "",
  ...sh(["npm install", `npm run build export ${folder}/factory <factory resource ID> arm`]),
  "",
  "They write `node_modules/`, `downloads/` and `arm/` here, which `.gitignore` keeps out of Git.",
  "",
  "Then, for each environment, in PowerShell 7 with the Az modules, signed in to its subscription",
  "with both `Connect-AzAccount` (for the script) and `az login` (for the deployment):",
  "",
  ...powershell([
    `./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters ${folder}/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $true -DeleteDeployment $false`,
    `az deployment group create --resource-group <group> --mode Incremental --template-file arm/ARMTemplateForFactory.json --parameters "@${folder}/parameters/<environment>.json" factoryName=<factory>`,
    `./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters ${folder}/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $false -DeleteDeployment $true`,
  ]),
  "",
  "`<factory resource ID>` is the dev factory's,",
  "`/subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.DataFactory/factories/<factory>`;",
  "`<group>` and `<factory>` are each environment's resource group and data factory.",
  "Where a deployment creates a self-hosted integration runtime, register a node with it before",
  `the copies run. The full steps, with CI: ${adfDeploy}.`,
];

/** What each pack's README says about deploying its folder, in a few lines. */
const deploys: Record<string, Deploy> = {
  adf,
  databricks: (_output, folder) => [
    "One bundle with a target for each environment. For each environment, from the folder:",
    "",
    ...sh([
      `cd ${folder}`,
      "databricks bundle validate -t <environment>",
      "databricks bundle deploy -t <environment>",
    ]),
    "",
    "The Databricks CLI deploys to the workspace it is signed in to, unless the platform's",
    "`workspace.host` names one: sign in to each environment's workspace, or set it per environment.",
  ],
  synapse: (_output, folder) => [
    "One `views.sql` for every environment, and a script for each that sets its values. For each",
    "environment, from the folder, with sqlcmd (Go):",
    "",
    ...sh([
      `cd ${folder}`,
      "sqlcmd -S <workspace>-ondemand.sql.azuresynapse.net --authentication-method ActiveDirectoryInteractive -i environments/<environment>.sql",
    ]),
    "",
    "`<workspace>` is that environment's Synapse workspace name.",
  ],
  duckdb: (_output, folder) => [
    "A folder for each environment. Build its tables on this computer:",
    "",
    ...sh([`duckdb -bail ingestron.duckdb -c ".read ${folder}/<environment>/run.sql"`]),
  ],
  products: (_output, folder) => [
    `Each environment's data product passports, in \`${folder}/<environment>/\`. Publish them where your catalogue reads them.`,
  ],
};

/** The Deploy section for the output folders `plan` would write, Data Factory's first. */
export function deploySection(outputs: readonly Output[], out = "build"): string {
  if (outputs.length === 0)
    return "## Deploy\n\nRun `ingestron plan` first: the definitions have problems to fix.";
  const ordered = [...outputs].sort((a, b) => Number(b.name === "adf") - Number(a.name === "adf"));
  const blocks = ordered.map((output) => {
    const folder = `${out}/${output.folder}`;
    const how = deploys[output.name] ?? (() => ["See the pack's documentation."]);
    return [
      `### ${output.name}: \`${folder}\` (${output.targets.join(", ")})`,
      "",
      ...how(output, folder),
      ...suppliedWhenDeploying(output),
    ].join("\n");
  });
  return ["## Deploy", ...blocks].join("\n\n");
}

/** The names under which the deploying pipeline supplies the pack's deploy-time values. */
function suppliedWhenDeploying(output: Output): string[] {
  const names = (output.deployValues ?? []).flatMap((value) => value.suppliedAs);
  if (names.length === 0) return [];
  const listed = names.map((name) => `\`${name}\``).join(", ");
  const how = output.name === "adf" ? " (add `<name>=<value>` to the deployment for each)" : "";
  return ["", `The deploying pipeline supplies ${listed} for each environment${how}.`];
}
