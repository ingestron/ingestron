# 02: Problems

Resolves the files of the [fixed-setting conformance case](../../../../spec/definitions/conformance/08-fixed-setting.yaml),
where the flow sets `mode: upsert` but the standard fixes `mode` to
`append`. There is no model, and the problem names the file, line and column
of the setting to change, with the fix an editor can apply: remove the
setting so the standard's value is used.

## Expected output

```text
model: none
sales.yaml:6:17  error  FIXED_SETTING
  The standard fixes "mode" to "append".
  Remove this setting, or change the standard.
  Fix: Remove this setting.
```
