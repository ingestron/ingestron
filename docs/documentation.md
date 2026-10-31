# Writing Ingestron documentation

Help the reader finish a real task without the author beside them. Describe
only what the code in this repository does today. This applies to every page,
example README, package README and user-facing command text.

## Where things go

- User documentation lives only in `apps/docs/content/docs/`. Package READMEs
  say what the package is, how to install it and how to develop it, and link
  to the site.
- Samples live in `samples/starters/<name>/` (complete projects to start
  from) and `samples/guides/<name>/` (one idea each). Pages show their files
  with `<Example name="<name>" file="…" />`; never paste sample YAML into a
  page. What a sample uses comes from resolving it; never hand-write it.
- Facts the code knows (settings, defaults, connector facts, error codes,
  document fields, CLI commands) are rendered by components in
  `apps/docs/components/reference/`. Change the code, not the page.
- Organise by the reader's job. Steps that differ between the CLI, VS Code and
  Studio go in `<ToolSteps>`; a page under Tools only when one tool alone has
  the feature.

## One voice

Read the [writing standard](documentation-standard.md) before writing or
restructuring. In short:

- Write to the reader: “Run”, “Open”, “Save”, “Check”. Use familiar words.
- Lead with the outcome. Explain a term where the reader first needs it.
- Show a small working example, then the values the reader changes.
- Show the expected file or output after each meaningful step.
- Warn only for a concrete consequence at that step. No preview banners,
  backlog IDs, release gates or padding. New Zealand English.

## Check

Run `pnpm validate` under Node 22. After a structural change, look at the
pages at desktop and phone width, in light and dark, and with the keyboard.
