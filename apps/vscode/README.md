# Ingestron for VS Code

Problems as you type, go to definition, references and rename, completion that
knows your project, hover that explains where each setting came from, previews
of the generated files, and the Plan, Apply, Check and New project commands, for
Ingestron projects.

User documentation lives in the docs site (`apps/docs`), under Tools → VS Code.

## Install

```sh
pnpm --filter ingestron-vscode package
code --install-extension apps/vscode/ingestron.vsix
```

## Develop

```sh
pnpm --filter ingestron-vscode validate          # lint, types, bundle, unit tests
pnpm --filter ingestron-vscode test:integration  # in a downloaded VS Code
```

The features in `src/features/` are plain functions over a project's files and
are tested without VS Code; `src/vscode/` registers them. The bundle is
`dist/extension.cjs`; `scripts/build.mjs` copies the schemas, SQL templates and
built-in project templates beside it.

## Privacy

The extension sends no telemetry and makes no network calls of its own. It
reads and writes only the files in your workspace. Questions: privacy@ingestron.io.
