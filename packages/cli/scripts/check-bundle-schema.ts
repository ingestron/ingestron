// Validates every example's generated YAML against the bundle schema of
// the Databricks CLI you deploy with. The schema is not stored here because
// it belongs to the CLI version in use:
//   databricks bundle schema > bundle-schema.json
//   pnpm check:bundle bundle-schema.json
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { parse } from "yaml";
import { databricks } from "@ingestron/pack-databricks";
import { exampleModels } from "./examples.js";

const schemaPath = process.argv[2];
if (!schemaPath) {
  console.log("✗ usage: pnpm check:bundle <bundle-schema.json from `databricks bundle schema`>");
  process.exit(1);
}
const validate = new Ajv({ strict: false, allErrors: true }).compile(
  JSON.parse(readFileSync(schemaPath, "utf8")),
);
let failures = 0;
// Only examples whose standard lists the Databricks pack generate a bundle.
const withBundles = exampleModels().filter(({ model }) =>
  model.standard.packs.some((pack) => pack.startsWith("databricks@")),
);
for (const { name, model } of withBundles) {
  for (const [path, text] of Object.entries(databricks.build(model)).filter(([path]) =>
    path.endsWith(".yml"),
  )) {
    const valid = validate(parse(text));
    if (!valid) failures += 1;
    console.log(
      `${valid ? "✓" : "✗"} ${name} ${path}${valid ? "" : `\n  ${JSON.stringify(validate.errors)}`}`,
    );
  }
}
process.exit(failures === 0 ? 0 : 1);
