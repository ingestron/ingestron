# @ingestron/authoring

Editor features for Ingestron projects: problems and quick fixes, completion
and smart defaults, hover explanations, go to definition, references and
rename, and previews of the generated files. They use the CLI's packs, so an
editor and the CLI never disagree.

The [VS Code extension](https://github.com/ingestron/vscode) adapts them to VS Code. User
documentation lives on the docs site.

## A project snapshot

`ProjectSnapshot.open(folder, open?)` opens the project in `folder` as the
editor sees it: `open` maps the absolute path of each file with unsaved changes
to its text, which is read before the disk. Ask the snapshot for what the
editor shows. A snapshot never changes, so each answer is worked out once; open
a new one after an edit or a change on disk.

```ts
import { readFileSync } from "node:fs";
import { ProjectSnapshot } from "@ingestron/authoring";

const snapshot = ProjectSnapshot.open("/work/shop", new Map());
for (const problem of snapshot.problems("dev")) console.log(problem.file, problem.message);
const text = readFileSync("/work/shop/flows/shop.yaml", "utf8");
console.log(snapshot.hoverAt("flows/shop.yaml", text, text.indexOf("upsert"), "dev"));
```

File paths are relative to the project folder, with forward slashes. Offsets
are into the file's text as the editor holds it. The environment is one the
project declares, or `undefined` for a project that declares none.

Before 2.2 each of these was a function that took the project as its first
argument, such as `problems(project, environment)`, and `openProject` opened
the project. Call the snapshot's method of the same name instead:
`projectSymbols` is now `symbols`, `compareEnvironments` is `compare`, and
`platformRequest` is `request`.

## Documentation

User documentation: https://docs.ingestron.io.

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
