// README.md's Deploy section: how each output folder is deployed per environment, and the
// deploy-time values its pack names (spec/cli/projects.md, "README.md").
import type { Output } from "./build-outputs.js";

type Deploy = (output: Output, folder: string) => string[];

/** What each pack's README says about deploying its folder, in a few lines. */
const deploys: Record<string, Deploy> = {
  databricks: (output, folder) => [
    `One bundle with a target for each environment. From the folder, for each environment:`,
    "",
    ...commands([
      `cd ${folder}`,
      `databricks bundle validate -t ${output.targets.at(-1)}`,
      `databricks bundle deploy -t ${output.targets.at(-1)}`,
    ]),
  ],
  adf: (_output, folder) => [
    `One factory for every environment, \`${folder}/factory/\`, and a parameter file for each,`,
    `\`${folder}/parameters/<environment>.json\`. Build the ARM template once with Microsoft's`,
    "`@microsoft/azure-data-factory-utilities`:",
    "",
    ...commands([`npm run build export ${folder}/factory <factory resource ID> arm`]),
    "",
    "Then, for each environment: the pre-deployment script, the deployment and the",
    "post-deployment script, each given that environment's parameter file:",
    "",
    ...commands([
      `./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters ${folder}/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $true -DeleteDeployment $false`,
      `az deployment group create --resource-group <group> --mode Incremental --template-file arm/ARMTemplateForFactory.json --parameters @${folder}/parameters/<environment>.json factoryName=<factory>`,
      `./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters ${folder}/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $false -DeleteDeployment $true`,
    ]),
  ],
  synapse: (output, folder) => [
    "One `views.sql` for every environment, and a script for each that sets its values. From the",
    "folder, with sqlcmd (Go), for each environment:",
    "",
    ...commands([
      `cd ${folder}`,
      `sqlcmd -S <workspace>-ondemand.sql.azuresynapse.net --authentication-method ActiveDirectoryInteractive -i environments/${output.targets.at(-1)}.sql`,
    ]),
  ],
  duckdb: (output, folder) => [
    "A folder for each environment. Build its tables on this computer:",
    "",
    ...commands([
      `duckdb -bail ingestron.duckdb -c ".read ${folder}/${output.targets[0]}/run.sql"`,
    ]),
  ],
  products: (_output, folder) => [
    `Each environment's data product passports, in \`${folder}/<environment>/\`. Publish them where your catalogue reads them.`,
  ],
};

function commands(lines: string[]): string[] {
  return lines.map((line) => `    ${line}`);
}

/** The Deploy section for the output folders `plan` would write. */
export function deploySection(outputs: readonly Output[], out = "build"): string {
  if (outputs.length === 0)
    return "## Deploy\n\nRun `ingestron plan` first: the definitions have problems to fix.";
  const blocks = outputs.map((output) => {
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
  return [
    "",
    `The deploying pipeline supplies ${names.map((name) => `\`${name}\``).join(", ")} for each environment.`,
  ];
}
