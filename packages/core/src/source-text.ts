// Text the project guide and the source request both write, kept in one place so that they
// cannot drift apart. A file of its own at the top of src, as code-point.ts is, so that the
// `assistant` and `sources` modules need not import each other.

/**
 * The fields of a columns file, in order, as the guide and the source request list them.
 * @internal
 */
export const columnsFileFields =
  "`table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key)";

/**
 * The heading of the part of the guide that says how to work with source metadata; the source
 * request looks for it to offer the assistant's columns file.
 * @internal
 */
export const sourceGuideHeading = "## Source metadata";
