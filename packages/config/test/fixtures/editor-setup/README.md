# 07: Editor setup

Validation and completion in VS Code with the standard
[YAML extension by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml).
No custom extension or settings are needed.

Steps:

1. Generate editor schemas from your kinds with `toEditorSchema`, and write
   `manifestSchema` as it is for `project.yaml` (`run.ts`).
2. Associate them with files in **one** of two ways:
   - a first-line comment in each file:
     `# yaml-language-server: $schema=../schemas/pipeline.editor.json`
   - or a `yaml.schemas` workspace setting (see `.vscode/settings.json`).

What the editor schema adds to your schema:

| Field type in your schema                       | Editor accepts                                        | Editor flags                         |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| integer, boolean, list, enum…                   | its normal values, or a whole `${values.x}`           | `4x`, `${bundle.target}`             |
| text                                            | any text, our references, and `$${` escapes           | an unescaped `${…}` that is not ours |
| text with a `pattern`, `format` or length limit | text that meets those rules, or a whole `${values.x}` | text with a `${…}` embedded in it    |

Hover shows each field's `description`. `test/language-server.test.ts` opens
these files in the same language server the extension uses.

The loader does not use these files. It validates the resolved document
against your original schema, so the editor schema can be regenerated freely.

Not available with the standard extension: go-to-file on `${file:…}` and
completion of value names.

## Expected output

```text
wrote schemas/project.editor.json
wrote schemas/pipeline.editor.json
```
