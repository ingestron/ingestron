# Source metadata: recipes, readers, the request and the import

Source metadata says what each table at a source looks like: its columns,
their types and its key (definitions specification, section 12). Ingestron
never connects to a source. Someone who can reach the source runs a query,
calls an API or exports a file, and Ingestron reads that file.

This page says:

1. what a recipe is: how to get one kind of source's metadata;
2. how each reader turns a file into tables and columns;
3. how an import updates a connection's metadata document;
4. what the source request asks for;
5. how a contract is drafted from the metadata;
6. the commands.

Every file the request names is under `sources/` in the project's folder.
Nothing read from a file's rows is ever written: an import keeps names and
types only.

## 1. Recipes

A recipe is a YAML file, `recipes/<id>.yaml`, that says how to get one kind of
source's metadata, what to ask for it, which reader reads the result and how
the source's types map to logical types. Ingestron's own recipes are in the
`recipes` folder of `@ingestron/standards`, beside its kits, and in the
public `ingestron/standards` repository. They are the first of these folders
that exists, as for kits ([kits.md](kits.md), "Where kits are found"):

1. a `source-recipes` folder beside the folder that holds the running code,
   which a release bundled into one file copies from the package's `recipes`
   folder (it is not called `recipes`, which the bundle already uses for the
   Azure Data Factory pack's project recipes);
2. the `recipes` folder of `@ingestron/standards`, as `@ingestron/core`
   resolves the package.

When neither exists, there are none.

A project MAY keep its own recipes in `<project>/recipes/<id>.yaml`. A
project recipe replaces Ingestron's recipe of the same id, so a team can
correct a query without waiting for a release. The request names the file of
a project recipe it uses.

<!-- prettier-ignore -->
```yaml
id: sqlserver
title: SQL Server
kind: catalog
inputs:
  database: { description: "The database whose tables are loaded, such as ERP" }
ask:
  who: Someone who can query the catalog views of the source database
  access: VIEW DEFINITION on the database
  run: |
    SELECT ... WHERE s.name IN ({schemas})
  save: sources/{connection}.catalog.csv
read: columns
names: { parts: 3, caseSensitive: false }
types:
  - { match: "^bit$", logicalType: boolean }
  - { match: "^decimal\\((\\d+),(\\d+)\\)$", logicalType: number, options: { precision: $1, scale: $2 } }
sources:
  - { url: https://learn.microsoft.com/..., read: 2026-11-12 }
```

### Fields

`id`, `title`, `kind`, `ask`, `read` and `sources` are required. Any other key
than those below is an error.

- `id`: lower-case letters, digits and `-`, starting with a letter
  (`^[a-z][a-z0-9-]*$`), and equal to the file's name without `.yaml`.
- `title`: the source's name, as text.
- `kind`: `catalog` (a query or API call that reads the source's own
  catalog), `document` (a call that downloads a document the source
  publishes, such as OData `$metadata`) or `sample` (a file of what the
  source sends).
- `inputs` (default none): a mapping from each input's name to
  `{ description }`, the text that says what to write for it. An input's name
  matches `^[a-z][a-zA-Z0-9_]*$` and is not `connection`, `object` or
  `schemas`. A connection gives the values in
  `metadata.with`.
- `ask`: what the request asks for:
  - `who`: who should do it;
  - `access`: the permission it needs;
  - `run`: a query, or `call`: a URL. A `catalog` or `document` recipe has
    exactly one of them; a `sample` recipe has neither;
  - `save`: where to save the result, starting `sources/`;
  - `how` (optional): how to save it, such as from a browser, with `curl` or
    with Postman.
- `read`: the reader, one of `columns`, `sample`, `odcs`, `odata`,
  `openapi`, `json-schema`, `avro` and `salesforce-describe` (section 2).
- `names` (optional): how the source names a table, as the metadata
  document's `names` (definitions specification, section 12.1): `parts`,
  from 1 to 4, and `caseSensitive`, both required. An import writes it into
  the document.
- `types` (default none): the source's types, as rules tried in order. Each
  is `{ match, logicalType, options? }`:
  - `match` is a regular expression, applied without case to the source's
    type as written;
  - `logicalType` is one of the ODCS logical types: `string`, `date`,
    `timestamp`, `time`, `number`, `integer`, `object`, `array` and
    `boolean`;
  - `options` are the logical type's options, such as `precision`. A value
    `$1`, `$2` and so on is that capture group of `match`, read as a whole
    number; an option whose group matched nothing is left out. Any other
    value is used as written.
- `rows` (optional, with the readers `columns` and `sample`): a path of keys
  joined with `.` to the list of records in a JSON result, such as `result`.
- `fields` (optional, with the reader `columns`): for each field of the
  columns file (section 2.1), the name of the result's field that holds it.
  A name that starts with `!` is a true-or-false field read the other way
  round, as `!mandatory` for `is_nullable`. When `fields` is given, it maps
  `table_name`, `column_name` and `data_type`.
- `key` (optional, with the reader `columns`): the names of the columns that
  form each table's primary key, in order.
- `objects` (optional, with the reader `odata`): `sets`, the default, names
  each table after its entity set; `types` names it after its entity type.
- `columnNames` (optional): `{ match, to }`, which renames a column the way
  the source's copy tools name it, such as Dataverse's lookup property
  `_<name>_value`, which Azure Data Factory and Fabric copy as `<name>`.
  `match` is a regular expression, applied without case to the name of each
  column of a table, and `to` is the new name, in which `$1`, `$2` and so on
  are the capture groups of `match`, and a group that matched nothing is
  empty. A column whose name `match` does not match keeps its name, and so
  does one whose new name would be empty. The rule is applied once to each
  name, and only to the columns of a table, not to the fields nested in a
  column. It is applied by the reader the recipe names, to the names that
  reader reads (section 2); `fields` and `key` name the result's own names, as
  it holds them, before the rule is applied.
- `sources`: at least one `{ url, read }`, the vendor's documentation the
  recipe's query, call and type rules come from: `url` an `https://` URL, and
  `read` the date it was read, `YYYY-MM-DD`, a real date written as text.

`readSourceRecipe` checks the rules in this order and stops at the first that
is broken, as `readKit` does ([kits.md](kits.md), "Rules"):

1. The file is valid YAML and a mapping.
2. No key other than those above, and none of the required ones missing.
3. Each field has its shape: `title`, `ask`'s fields, `rows`, `columnNames`'
   `match` and `to`, and each `description` are text; `inputs`, `ask`,
   `names`, `fields` and `columnNames` are mappings; `types`, `key` and `sources` are lists; `kind`, `read`,
   `objects` and each `logicalType` are one of their values; `names` has
   both `parts`, from 1 to 4, and `caseSensitive`, true or false;
   `columnNames` has both `match` and `to`.
4. `id` matches its pattern and equals the file's name.
5. Each input's name matches its pattern and is not one of the three
   reserved names.
6. `ask` has `run` or `call` as `kind` says, and `save` starts `sources/`.
7. `rows`, `fields`, `key` and `objects` are given only with their readers;
   each key of `fields` is a field of the columns file, and `fields` maps
   `table_name`, `column_name` and `data_type`.
8. Each `match` is a valid regular expression, those of `types` first and
   then `columnNames`'s.
9. `sources` has at least one entry; each `url` is an `https://` URL and each
   `read` a real date, `YYYY-MM-DD`.

Each rule has a conformance case in `conformance/sources/recipes/cases.json`
with the exact message, which names the file and the rule broken, as
`readKit`'s do. The installed recipes and the project's are read whole,
whichever a connection uses, so a recipe that breaks a rule stops the request
and every import with its message, even when no connection uses it: a
broken recipe is found at once, not when a connection first names it.

### Placeholders

The text of `ask` MAY hold these placeholders, which the request fills in:

- `{connection}`: the connection's id;
- `{object}`: one table's `object`, as the flow writes it, resolved. A step
  that holds it is written once for each table (section 4);
- `{schemas}`: the schemas the connection's flow tables read (section 4), each
  as a single-quoted SQL literal, joined with `, `, such as `'dbo', 'sales'`;
- `{<input>}`: the value the connection gives for that input. A value that
  holds an unset reference (`${envvar:…}` set nowhere) is not given: the
  placeholder is left as written, as for an input the connection does not
  give.

A placeholder that cannot be filled is left as written, and the request says
what to write in its place. Any other text in braces is left as written.

### A connection's recipe

A connection's recipe is the one its `metadata.from` names. Without
`metadata`, it is its connector's default: `files` has the `sample` recipe,
`sqlserver` the `sqlserver` recipe, `salesforce` the `salesforce` recipe and
`kafka` the `schema-registry` recipe. Any other connector has none. A
connection with no recipe is asked for the lower steps only (section 4).

Resolving checks `metadata` for its shape only (definitions specification,
section 12.2). The request and the import check it against the recipes:

- a recipe that does not exist:
  `The connection "<id>" names the recipe "<from>", which does not exist. Recipes: <ids>.`
  with every recipe id, in code-point order, joined with `, `, or `none`;
- an input the recipe does not take:
  `The recipe "<id>" takes no input "<name>". Its inputs: <names, or none>.`
  with the recipe's input names, in the order the recipe gives them, joined
  with `, `, or `none`.

An input the recipe takes and the connection does not give is not an error:
the request leaves its placeholder for the reader to fill in.

## 2. Readers

A reader is a pure function from a file's path, its contents and the
connection's recipe (when it has one) to tables, or to the reasons it refuses
the file. A table is an `object` and its columns, each with the fields of a
metadata column (definitions specification, section 12.1). A reader never
keeps a value from a row.

Text is read as UTF-8, and a byte-order mark at the start is dropped. A file
that is not valid JSON, YAML or XML, where a reader needs one, is refused with
`<file> is not valid JSON at line <line>, column <column>.`, and likewise
`YAML` and `XML`, giving only where the parser stopped; when the parser gives
no place, `<file> is not valid JSON.` (or `YAML`, `XML`). The parser's own
message is never shown, since it may quote the file.

No refusal and no note quotes a file's content, except the names of fields,
tables and columns and the source's type names. A value in a row is never
shown, so a refusal is as safe to print as the metadata itself.

When the recipe that reads a file gives `columnNames` (section 1), the reader
applies it to the name of each column of each table it reads, once all the
tables are read, so that a source's naming quirk is in its recipe and not in a
reader. Only the columns of a table are renamed, not the fields nested in a
column, and a table's key and the columns' other facts are unchanged. A column
whose name the rule does not change, and one whose new name would be empty,
keeps its name. A table in which the rule gives two columns the same name is
refused:
`<file>: the recipe "<id>" gives two columns of the table "<object>" the name "<column>".`
(the first such name, in the table's column order, and the first such table).
`<id>` is the recipe's `id`. A file read by another reader than the recipe's,
and a columns file chosen by its name (section 2.5), are not renamed.

### 2.1 The columns file

The columns file is a table with one row per column and these eight fields,
in the order shown here, which is the order the request asks for:

| Field                  | Holds                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `table_catalog`        | the database, or empty when the source names tables in fewer parts                               |
| `table_schema`         | the schema, or empty when the source names tables in fewer parts                                 |
| `table_name`           | the table                                                                                        |
| `column_name`          | the column                                                                                       |
| `ordinal_position`     | the column's place in the table, from 1                                                          |
| `data_type`            | the type as the source states it, length, precision and scale folded in, such as `nvarchar(200)` |
| `is_nullable`          | whether the column can be null                                                                   |
| `primary_key_position` | the column's place in the primary key, from 1, or empty when not in the key                      |

It is CSV or JSON:

- **CSV.** The first line is the header. Lines end in LF or CRLF. Fields are
  separated by `,`, or by `;` when the header holds `;` and no `,`. A field
  MAY be in double quotes, with a quote inside written twice.
- **JSON.** A list of records, or, with the recipe's `rows`, the list at that
  path. Each record's keys are its fields.

A file's fields are its header's names (CSV) or each record's keys (JSON),
compared without case and without the spaces around them, so `TABLE_NAME` is
`table_name`. Their order does not matter. Unless the recipe gives `fields`,
the fields MUST be the eight, each once, and no other. A file that breaks
this is refused with one message, so that a query that returned rows is never
imported by mistake. The message names the expected fields that are missing
and counts the others, and never quotes a name it does not know, since a file
without a header has data in its first line:

- `<file> lacks the fields <missing> and has <n> other fields; a columns file has exactly: table_catalog, table_schema, table_name, column_name, ordinal_position, data_type, is_nullable, primary_key_position.`
  when some are missing and there are others;
- `<file> lacks the fields <missing>; a columns file has exactly: ...` when
  some are missing and there are no others;
- `<file> has <n> other fields; a columns file has exactly: ...` when none is
  missing.

`<missing>` is the missing fields in the order of the table above, joined with
`, `. `<n>` is the number of fields of the header (or of the first record that
breaks the rule) that are not the first of one of the eight, so a field that
is not one of them and a field that comes twice each count. `field` is `field`
for 1 and `fields` otherwise, in both places, and `lacks the field` is used
for one missing field. A JSON file that is not a list of records, or that has
no list at the recipe's `rows`, is refused:
`<file> holds no records: a JSON columns file is a list of records.`

When the recipe gives `fields`, the result's fields are read through it
instead, and other fields are ignored. A field the mapping leaves out takes
its default: `table_catalog` and `table_schema` are empty, `ordinal_position`
is the record's place in the file, `is_nullable` is true and
`primary_key_position` is empty. A field the mapping names that no record
has is refused:
`<file> has no field "<field>", which the recipe "<id>" reads as <columns field>.`

Each row is read so:

- The table's `object` is its non-empty `table_catalog`, `table_schema` and
  `table_name`, joined with `.`.
- A row with an empty `column_name` is skipped. A row with an empty
  `table_name` or an empty `data_type` is refused, and a refusal names only
  the row: `<file>, row <n>: table_name is empty.` or
  `<file>, row <n>: data_type is empty.` A row is refused for the first of its
  problems, checked in the order `table_name`, `data_type`, `is_nullable`,
  `ordinal_position`, `primary_key_position`.
- `is_nullable` is `YES`, `Y`, `true` or `1` for a column that can be null, and
  `NO`, `N`, `false` or `0` for one that cannot, without case. In JSON it MAY
  also be `true` or `false`, or the number `1` or `0`. `required` is `true`
  when it cannot. Any other value is refused:
  `<file>, row <n>: is_nullable is not YES or NO.`
- `ordinal_position` and `primary_key_position` are whole numbers from 1, as
  text or, in JSON, as numbers, or empty. Any other value is refused:
  `<file>, row <n>: <field> is not a whole number from 1.`
- The columns of a table are ordered by `ordinal_position`, and, when none
  has one, keep the file's order.
- A column's `primaryKeyPosition` is its `primary_key_position`. When the
  recipe gives `key`, a table's key is instead the columns of `key` it has, in
  `key`'s order, numbered from 1, and `primary_key_position` is not read.
- `sourceType` is `data_type` as written, without the spaces around it. Its
  logical type is found by the rules of section 2.6.

`<n>` counts the file's records from 1, the header not counted. A table is
refused, naming it, when:

- it lists the same column twice:
  `<file>: the table "<object>" lists the column "<column>" twice.`;
- two of its columns have the same `ordinal_position`:
  `<file>: the table "<object>" gives two columns the same ordinal_position.`;
- some of its columns have an `ordinal_position` and others have none:
  `<file>: the table "<object>" gives ordinal_position to some columns and not others.`;
- two of its columns have the same `primary_key_position`:
  `<file>: the table "<object>" gives two columns the same primary_key_position.`

A file with no column is refused: `<file> lists no columns.`

### 2.2 Samples

A sample is a data file the source sends: CSV, JSON, JSON lines (`.jsonl` or
`.ndjson`) or Parquet. A sample describes one table, whose `object` is given
by the import (section 3).

- **CSV** is read as the columns file is (section 2.1). Its header gives the
  column names, in order. A name that is empty is left out. The first line is
  refused as a header, with `<file> has no header row: every field of its first line is a number, a date, a timestamp or a boolean.`,
  only when no field of it could be a name: each is empty or, as
  `ingestron contract <sample>` reads values, a number (an integer with
  leading zeros too), a date, a timestamp or a boolean. So `region,2023,2024`
  is a header, and the message never quotes the line. The test cannot tell a
  headerless file whose first line holds some text from a header: its values
  become column names, which is the rule of this section.
- **JSON** is a list of records, or one record. With the recipe's `rows`, the
  records are the list at that path, so a saved API response that wraps its
  records, such as `{ "value": [...] }`, is read through its recipe.
- **JSON lines** holds one record on each line; empty lines are skipped.
- **Parquet** is read from its footer only: the schema, never the rows.

From CSV and JSON, the columns are each name found, in the order first
found. A column's logical type is the narrowest that every non-empty value
fits, as `ingestron contract <sample>` infers it: `integer`, `number`,
`boolean`, `date`, `timestamp`, else `string`; a column with no non-empty
value is `string`. A value that is a record makes the column
`logicalType: object`, with the record's fields as its `properties`, read the
same way; a list makes it `logicalType: array`, with its elements read as one
column, its `items`, which is named `items`. Every column has `required: false` and no
`primaryKeyPosition`, and no `sourceType`. The values are read only to find
the types and are then dropped.

From Parquet, each field of the schema is a column: `required` is `true` for a
`REQUIRED` field; a group is `object`, with its fields as `properties`; a
`LIST` is `array`, with its element as `items`. A field's logical annotation
(`DATE`, `TIMESTAMP`, `TIME`, `DECIMAL`, `STRING`, `INTEGER`) decides its type
when it has one, whatever its physical type, so an `INT32` field annotated
`DATE` is `date`. Then:

| Parquet                                    | Logical type                           |
| ------------------------------------------ | -------------------------------------- |
| `BOOLEAN`                                  | `boolean`                              |
| `INT32`, `INT64`, an `INTEGER` annotation  | `integer`                              |
| `FLOAT`, `DOUBLE`                          | `number`                               |
| a `DECIMAL` annotation                     | `number`, with `precision` and `scale` |
| `DATE`                                     | `date`                                 |
| `TIMESTAMP`, and the physical type `INT96` | `timestamp`                            |
| `TIME`                                     | `time`                                 |
| `BYTE_ARRAY` with `STRING`, and any other  | `string`                               |

A `DECIMAL` field that gives no scale has a `scale` of 0. `sourceType` is the field's physical type, with its annotation after it in
brackets when it has one, such as `INT32(DATE)`. A Parquet file has no key.

A sample is refused when it has no columns: `<file> has no columns.`; when
its JSON is not records:
`<file> holds no records: a JSON sample is a list of records, or one record.`;
or when its Parquet footer cannot be read:
`<file> is not a Parquet file Ingestron can read.`

### 2.3 ODCS contracts

An ODCS document (`kind: DataContract`), such as one a source's team keeps.
Each entry of `schema` is a table: its `object` is the entry's
`physicalName`, else its `name`. Each property is a column:

- `name` is the property's `physicalName`, else its `name`;
- `logicalType`, `logicalTypeOptions` and `required` are the property's;
  a property with no `logicalType` is `string`, and so is one whose
  `logicalType` is text that is not one of the logical types a recipe's `types` may give (section 1),
  with the note `Type "<logicalType>" of <object>.<column> is not known; read as string.`,
  where `<column>` is the property's name, after the names of the properties
  it is nested in, joined with `.`;
- `primaryKeyPosition` is the property's, for a property with
  `primaryKey: true` and a whole `primaryKeyPosition` from 1. A property with
  `primaryKey: true` and none takes the next positions, in the order of the
  properties, counting from one more than the highest position the properties
  of its table give (from 1 when none gives one);
- `sourceType` is the property's `physicalType`, when it has one;
- nested `properties` and `items` are read the same way.

A contract with no `schema` entries is refused:
`<file> is a data contract with no schema entries.` A file read as an ODCS
document by its name (section 2.5) that does not have `kind: DataContract` is
refused: `<file> is not an ODCS data contract: it has no kind: DataContract.`

### 2.4 Documents a source publishes

- **OData** (`odata`): a CSDL document, XML whose root element is `Edmx`. A
  file is read as OData by its content only when its name ends `.xml` or
  `.edmx`; any other file is read as OData only as the reader of the
  connection's recipe, or by the `.catalog.` name rule (section 2.5). Each
  entity set is a table named after the set, or, with the recipe's
  `objects: types`, each entity type that is not abstract (`Abstract="true"`)
  is a table named after the type. Each
  property is a column: `Nullable="false"` makes it required, and
  `<Key>`'s `PropertyRef`s, in order, are the primary key, whose columns are
  required. A complex type is `object`, with its properties as `properties`,
  and `Collection(…)` is `array`, with its element as `items`. A `Collection`
  column is always required, and `Nullable="false"` makes its elements
  required, so `items` is required. Navigation properties are left out. A
  complex type's properties are written in full only the first time the type
  is used in a table (the table's own entity type counts as used); each
  later use is `object` without `properties`, and so is a use nested deeper
  than 16 levels.
  `sourceType` is the property's `Type`. Types: `Edm.String` is `string`, with
  `MaxLength` as `maxLength` when it is a number; `Edm.Byte`, `Edm.SByte`,
  `Edm.Int16`, `Edm.Int32` and `Edm.Int64` are `integer`; `Edm.Decimal` is
  `number`, with `Precision` when it is a number and `Scale`, which is 0 when
  it is missing or is not a number, except that `Scale="Variable"` or
  `Scale="floating"`, in any letter case, means any scale and gives none; `Edm.Single`
  and `Edm.Double` are `number`; `Edm.Boolean` is `boolean`; `Edm.Date` is
  `date`; `Edm.DateTimeOffset` and `Edm.DateTime` are `timestamp`;
  `Edm.TimeOfDay` and `Edm.Time` are `time`; any other is `string`.
  A type with a `BaseType` has the properties of its base types first, and
  their key when it gives none; a type that is its own base type, directly or
  through others, has each property once. An entity set whose type the
  document does not define is left out, with the note
  `The entity set "<set>" is left out: its type "<type>" is not defined in the document.`
  A document with no entity set (or, with
  `objects: types`, no entity type that is not abstract) is refused:
  `<file> describes no entity sets.` (or `no entity types`).
- **OpenAPI** (`openapi`): JSON or YAML with a top-level `openapi` (3.x) or
  `swagger` (2.0). Each schema of `components.schemas` (`definitions` in
  Swagger 2.0) that is an object with `properties` (its `type` is `object`,
  a list whose first type other than `"null"` is `object`, or missing) is a
  table named by its key. `$ref`s within the file are followed. A property in the schema's
  `required` list is required. A document with no such schema is refused:
  `<file> describes no object schemas.`
- **JSON Schema** (`json-schema`): JSON with a top-level `$schema`. It is one
  table, named by the import's `object`, else its `title`, else the file's
  name without its last extension. A property in the document's `required`
  list is required. A document with no `properties` is refused:
  `<file> describes no properties.`
- **Avro** (`avro`): a schema whose top-level `type` is `record` and that has
  a `fields` list. The record
  is one table, named by the import's `object`, else its `name`. Each field is
  a column; a union with `"null"` is not required, and any other field is.
  A nested record is `object`, with its fields as `properties`, and so is a
  name that refers to a record defined anywhere in the schema, including the
  `values` of a `map`. A record's full name is its `name` when that holds a
  `.`, else its `namespace` (its own, or that of the record it is in) and its
  `name` joined with `.`; a name with no `.` is looked up in the namespace of
  the record that holds the field, then without one. A record is written in
  full only the first time in a table (the table's own record counts as the
  first); wherever it appears again it is `object` without `properties`, with
  its `name` as `sourceType`, and so is a record nested deeper than 16
  levels. An `array` is
  `array`, with its element as `items`, which is required unless it is a
  union with `"null"`; a `map` is `object`. A union of two
  or more types other than `"null"` is `string`, with the note
  `The column <object>.<column> is a union of <types>; read as string.`,
  where `<types>` are the type names of the union other than `"null"`, joined
  with `, `. `sourceType` is the field's `logicalType` when it has one, else
  its type's name (`record`, `array`, `map`, `enum`, `fixed`, or `union` for
  a union of two or more types). A record with no field is refused:
  `<file> describes no fields.` Types:
  `int` and `long` are `integer`; `float` and `double` are `number`; `boolean`
  is `boolean`; `decimal` is `number`, with `precision` and `scale`; `date` is
  `date`; `timestamp-millis`, `timestamp-micros` and the `local-timestamp-`
  forms are `timestamp`; `time-millis` and `time-micros` are `time`; any
  other is `string`.
- **A schema registry's response**: a JSON mapping whose `schema` is text and
  that also has `subject`, `id` or `version`, as a registry returns a
  subject's version. (A sample record with a text column `schema` is a sample.) Its `schema` is read with Avro when
  `schemaType` is missing or `AVRO`, and with JSON Schema when it is `JSON`.
  The readers `avro` and `json-schema` both accept it, and each reads it by
  its `schemaType`. `PROTOBUF` is refused:
  `Protobuf schemas are not read yet; save the topic's columns as a columns file instead.`
  Any other `schemaType` is refused:
  `<file> is a schema registry response of a type Ingestron does not read; it reads AVRO and JSON.`
  A `schema` that is not valid JSON is refused:
  `<file> holds a schema that is not valid JSON.` A JSON Schema in a response
  needs no `$schema`.
- **Salesforce describe** (`salesforce-describe`): a JSON mapping with a
  `name` and a list of `fields`, as an object's `describe` returns it. It is
  read only as the reader of the connection's recipe, or by the `.catalog.`
  name rule: no file is read as a describe by its content. The
  table is named by `name`. Each field is a column: `nillable: false` makes it
  required, and the field whose `type` is `id` is the primary key.
  `sourceType` is the field's `type`, and its logical type is found by the
  rules of section 2.6, and where that gives `string`, a field's `length`
  that is above 0 is its `maxLength`, and where it gives `number`, a
  `precision` above 0 is its `precision`, with its `scale` (0 when missing),
  unless the recipe's rule gave an option of the same name. A describe with no
  field that has a `name` is refused: `<file> describes no fields.`

When a recipe or a file's name chooses one of these readers and the file is not
in its format, the reader refuses it:

- OData: `<file> is not an OData CSDL document: its root element is not Edmx.`
- OpenAPI: `<file> is not an OpenAPI document: it has no top-level openapi or swagger.`
- JSON Schema: `<file> is not a JSON Schema: it has no top-level $schema.`
- Avro: `<file> is not an Avro schema: its top-level type is not record.`
- Salesforce describe: `<file> is not a Salesforce describe: it has no name and fields.`

OpenAPI, JSON Schema and Avro state no key, so their tables have none.

The readers of typed formats (Parquet, ODCS, OData, OpenAPI, JSON Schema and
Avro) map their types themselves, as above. In OpenAPI and JSON Schema,
`integer` is `integer`, `number` is `number`, `boolean` is `boolean`, `object`
is `object` with its `properties`, `array` is `array` with its `items`, and
`string` is `string` (with `maxLength`), or `date`, `timestamp` or `time` for
the formats `date`, `date-time` and `time`. `sourceType` is the `type`, with
its `format` after it in brackets when it has one, such as `string(date-time)`.
A `type` that is a list is its first type other than `"null"`. A schema with
no `type` is `object` when it has `properties`, `array` when it has `items`,
and otherwise `string`, as is one whose `$ref` is not within the file. A
schema reached by `$ref` is written in full only the first time in a table
(the table's own schema counts as the first); wherever it appears again it
has its type, `object` or `array`, without `properties` or `items`, and the
last part of the `$ref`, such as `Address`, as its `sourceType`. An object
nested deeper than 16 levels has no `properties`. `enum`, `default`, `example` and every other keyword are
not read, so no value of the data a schema describes reaches the metadata.

### 2.5 Choosing the reader

The file's name decides first, as the request names files (section 4), by
its last two extensions:

- a name that ends `.columns.<ext>` or `.assistant.<ext>` is read as a
  columns file only, with the recipe's `types` but without its `rows`,
  `fields`, `key` and `columnNames`;
- a name that ends `.odcs.<ext>` is read as an ODCS document only;
- a name that ends `.catalog.<ext>` is read by the recipe's reader only,
  with every field of the recipe. Without a recipe it is refused:
  `<file> is a catalog result, but no recipe was given to read it.`

The name rule never applies to a file under `sources/<connection>/`, for the
connection being imported (when the connection is not given, a file under any
`sources/<folder>/`): that path names one object (section 3), whatever
its name holds. So `sources/shop/shop.catalog.Products.csv` and
`sources/erp/information_schema.columns.csv` are files of the objects
`shop.catalog.Products` and `information_schema.columns`.

Any other file is read by the first of these that accepts it:

1. the recipe's reader;
2. the columns reader, when the file's fields are the columns file's;
3. the ODCS reader, when the file has `kind: DataContract`;
4. the readers of section 2.4 other than `salesforce-describe`, in the order
   listed, each when the file is in its format (OData only for a `.xml` or
   `.edmx` file, section 2.4);
5. the sample reader, by the file's extension: `.csv`, `.json`, `.jsonl`,
   `.ndjson` or `.parquet`.

A file none accepts is refused:
`<file> is not a file Ingestron reads: a columns file, an ODCS contract, OData CSDL, OpenAPI, JSON Schema, Avro, a schema registry response, a Salesforce describe, or a sample ending .csv, .json, .jsonl, .ndjson or .parquet.`

The reader and the file's name give each table's `captured.from`:

- the recipe's reader read the file: the recipe's `kind`, `catalog`,
  `document` or `sample`;
- the columns reader read it: `columns`, or `assistant` when the file's name
  ends `.assistant.<ext>`;
- the ODCS reader, or a reader of section 2.4 without the recipe: `document`;
- otherwise: `sample`.

### 2.6 Types of the columns file and Salesforce describe

The columns reader and the Salesforce describe reader find a column's logical
type from its `sourceType` by the first of these that gives one:

1. the recipe's `types` rules, in order;
2. the generic map below, without case. A text type's length in brackets,
   such as `nvarchar(200)`, is `maxLength`, except `(max)`; for `decimal`
   and `numeric`, `(p,s)` is `precision` and `scale`, and `(p)` is
   `precision` with a `scale` of 0. Other brackets are ignored;
3. `string`, with the note `Type "<type>" of <object>.<column> is not known; read as string.`

| Source type                                                                                                 | Logical type |
| ----------------------------------------------------------------------------------------------------------- | ------------ |
| `char`, `character`, `varchar`, `character varying`, `nchar`, `nvarchar`, `text`, `clob`, `nclob`, `string` | `string`     |
| `smallint`, `int`, `integer`, `bigint`                                                                      | `integer`    |
| `decimal`, `numeric`, `real`, `float`, `double`, `double precision`                                         | `number`     |
| `boolean`                                                                                                   | `boolean`    |
| `date`                                                                                                      | `date`       |
| `timestamp`, and `timestamp` with a precision or a time zone                                                | `timestamp`  |
| `time`, and `time` with a precision or a time zone                                                          | `time`       |

## 3. Importing

`importSource` updates one connection's metadata document,
`sources/<connection>.yaml`, from one file. It is a pure function: given the
document's current text (or none), the file's path and contents, the
connection's recipe and the options, it returns the new text, the changes
and the notes, or the reasons it refuses the file. It writes nothing.

It refuses:

- a current text that is not a `SourceMetadata` document of the connection:
  `sources/<connection>.yaml is not the source metadata of "<connection>".`;
- the metadata document itself, `sources/<connection>.yaml` or `.yml`:
  `<file> is source metadata already; import the file it was made from.`;
- a file the readers refuse, with their reasons;
- a file that describes no table: `<file> describes no tables.`;
- a file that describes the same `object` twice:
  `<file> describes "<object>" twice.`

### The object

A reader that reads one table (a sample, JSON Schema, Avro) takes its
`object` from:

1. the file's path, when it is `sources/<connection>/<object>.<ext>` for the
   connection being imported: the path below `sources/<connection>/`, without
   its last extension only. So `sources/landing/exports/orders.v2.csv` is the
   object `exports/orders.v2` of the connection `landing`;
2. else `--object`;
3. else, for a sample, the import is refused:
   `Name the table this file describes with --object.`
   JSON Schema and Avro then name the table themselves (section 2.4).

The path is the file's path relative to the project's folder, written with
`/`. A file outside the project's folder takes nothing from its path.

### What an import replaces

Tables are the same when their `object`s are equal, compared without case
when the document's `names.caseSensitive` is `false`, and with case
otherwise.

- An import reads the whole source when the connection's recipe is a
  `catalog` recipe, the recipe's reader read the file, that reader reads
  many tables (`columns`, `odata`, `openapi` or `odcs`), and the file is not
  under `sources/<connection>/`. It removes every table of the document whose
  `captured.from` is `catalog`, so a table dropped at the source disappears.
  Then it adds its own tables, each replacing a table of another rung with
  the same `object`.
- Any other import adds its tables or replaces the same ones, and keeps every
  other table. So does a catalog file read by a reader of one table
  (`salesforce-describe`, `avro`, `json-schema` or `sample`), such as one
  Salesforce `describe`, wherever the file is: it replaces only its own
  object.

### The document

The new document has:

- `id` and `connection`: the connection's id;
- `environment`: `--env`'s value, else the current document's, else none;
- `names`: the recipe's, else the current document's, else none;
- `tables`: each with `captured` of `at` (the time of the import, as
  `YYYY-MM-DDTHH:MM:SSZ` in UTC), `from` (section 2.5), `recipe` (the id of
  the connection's recipe, whenever the import is given one, since its
  `types` then apply; left out otherwise) and `file` (the file's path
  relative to the project's folder, or its name when it is outside it).

It is written so that a new import shows as a small diff:

- It starts with the comment
  `# Written by ingestron source import. Do not edit: import again to replace it.`
- Then `apiVersion`, `kind`, `id`, `connection`, `environment`, `names` and
  `tables`, in that order, in block style. `names` is a one-line flow mapping.
- Tables are sorted by `object`, in code-point order. Columns keep the
  source's order.
- Each table has `object`, `captured` and `columns`, in that order.
  `captured` is a one-line flow mapping of `at`, `from`, `recipe` and `file`.
- A column with no nested fields is a one-line flow mapping of `name`,
  `sourceType`, `logicalType`, `logicalTypeOptions`, `required` and
  `primaryKeyPosition`, in that order, each when it has one;
  `logicalTypeOptions` is a flow mapping inside it. A column with
  `properties` or `items` is a block mapping of the same keys, then
  `properties`, a list of columns written the same way, or `items`, one
  column.
- A value is written plain when YAML reads it back as the same value without
  a syntax error, and in double quotes otherwise, as `"decimal(18,2)"`, whose
  comma would end the value inside a flow mapping, or `"@x"`, which YAML
  cannot start a plain value with. The words `true`, `false`, `null`, `yes`,
  `no`, `on`, `off`, `y` and `n`, in any case, are always quoted, since a tool
  that reads YAML 1.1 would read them as another value.
- Lines are never wrapped. The text ends with a line break.

<!-- prettier-ignore -->
```yaml
# Written by ingestron source import. Do not edit: import again to replace it.
apiVersion: ingestron.io/v1
kind: SourceMetadata
id: erp
connection: erp
environment: dev
names: { parts: 3, caseSensitive: false }
tables:
  - object: ERP.dbo.Customers
    captured: { at: 2026-11-12T09:30:00Z, from: catalog, recipe: sqlserver, file: sources/erp.catalog.csv }
    columns:
      - { name: CustomerID, sourceType: int, logicalType: integer, required: true, primaryKeyPosition: 1 }
      - { name: Name, sourceType: nvarchar(200), logicalType: string, logicalTypeOptions: { maxLength: 200 }, required: false }
      - { name: CreditLimit, sourceType: "decimal(18,2)", logicalType: number, logicalTypeOptions: { precision: 18, scale: 2 }, required: false }
```

Importing the same file again gives the same text, except each table's
`captured.at`, and reports no changes.

### What changed

The import compares each table of the old document with the same table of
the new one, and gives one change for each table that differs:

- `added`: a table the old document did not have. It is compatible.
- `removed`: a table the old document had and the new one does not. Only a
  catalog import removes a table (above), and a removed table is breaking.
- `changed`: a table in both for which `compareSourceColumns` gives at least
  one difference, with the old table as the side compared and the new as
  the source: section 12.6 of the definitions specification, between two
  metadata tables instead of a contract and a table. Columns are matched by
  `name`, with case unless the document's `names.caseSensitive` is `false`.
  Only names are compared (new and gone columns) when either table is
  `captured.from: sample` or `assistant`. A key is compared only when both
  tables give one. A change is breaking when any of its differences is.

A table in both for which `compareSourceColumns` gives no difference is no
change, whatever its `captured` or any other field, though its new text is
still written. A table's differences are in the order `compareSourceColumns`
gives them: the old table's columns in order, then the new columns in
order, then the key.

The changes are in order of `object`, in code-point order. Their text is:

- a first line, `sources/<connection>.yaml: <n> added, <n> changed, <n> removed.`
  or, with no change, `sources/<connection>.yaml: no changes.`;
- `Breaking:`, then a line for each breaking difference;
- `Compatible:`, then a line for each compatible difference;
- each note of the readers, such as an unknown type, on a line of its own.

A list with no lines is left out, with its heading. Each line is
`  <object>: <difference>`, two spaces in, where `<difference>` is:

| Difference            | Text                                                     |
| --------------------- | -------------------------------------------------------- |
| a table added         | `added`                                                  |
| a table removed       | `removed`                                                |
| `SOURCE_COLUMN_NEW`   | `column "<column>" is new`                               |
| `SOURCE_COLUMN_GONE`  | `column "<column>" is gone`                              |
| `SOURCE_TYPE_CHANGED` | `column "<column>" is <new type>, but was <old type>`    |
| `SOURCE_TYPE_FITS`    | `column "<column>" is <new type>, which fits <old type>` |
| `SOURCE_NULLABLE`     | `column "<column>" was required, but can now be null`    |
| `SOURCE_KEY_CHANGED`  | `the primary key is (<new key>), but was (<old key>)`    |

Types and keys are written as section 12.6 of the definitions specification
writes them, such as `number(18,2)` and `(OrderID, LineNo)`.

```text
sources/erp.yaml: 1 added, 1 changed, 1 removed.
Breaking:
  ERP.dbo.Customers: column "CreditLimit" is number(18,0), but was number(18,2)
  ERP.dbo.Legacy: removed
Compatible:
  ERP.dbo.Customers: column "Email" is new
  ERP.dbo.Invoices: added
Type "geography" of ERP.dbo.Shops.Location is not known; read as string.
```

### The project's imports

The metadata document is loaded through `project.yaml`'s `imports`. When no
import matches `sources/<connection>.yaml` (`matchesImport`, configuration
specification), the import also adds that path, `sources/<connection>.yaml`,
at the end of `imports`, keeping `project.yaml`'s comments and layout: the
text around the list is not changed. It adds the document's own path, not a
pattern such as `sources/*.yaml`, so that other files saved in `sources/`,
such as a source team's `sources/<connection>.odcs.yaml`, are never loaded as
definitions.

## 4. The source request

The source request is a Markdown document that says, for each connection,
what to run, call or export to get its metadata, and where to save it. It is
ready to send to whoever can reach the source.

### Resolving

The definitions are resolved for the environment (`default` when none is
given) as for the platform request ([request.md](request.md), "Resolving"),
with `missingEnvvars: information` and `environmentsTogether: true`, and with
`sourceTables: true`, so that
the result lists each flow table's metadata entry (definitions
specification, section 12.7) with or without a model. These errors do not
stop it,
because the metadata the request asks for is what settles them:
`TABLE_NO_COLUMNS`, `CONTRACT_NEEDED`, `SOURCE_COLUMN_GONE`,
`SOURCE_TYPE_CHANGED`, `SOURCE_NULLABLE`, `SOURCE_KEY_CHANGED` and
`SOURCE_TABLE_GONE`.

Any other error stops it, and so do an unknown `--connection`, a recipe that
breaks a rule, and a connection's recipe problems (section 1). Recipe
problems are checked for the connections the request covers: each a flow
reads from, or the one `--connection` names. The request is
then the title `# Source request (<environment>)`, the note "The definitions
have problems; fix them first:", and each error in a `text` code block,
written as `ingestron plan` writes a problem, as the platform request writes
them. Warnings and information are left out. An unknown connection and a
recipe's problems are written in the same block, each on a line of its own,
after the definitions' errors. A pack that cannot be loaded gives the
`PACK_LOAD` error and the exit code 2, as for every command
([output folders](outputs.md), section 4). An unknown connection is
`"<id>" is not a connection of the project. Connections: <ids>.`
with every connection id, in code-point order, joined with `, `, or `none`.

### Layout

The title is `# Source request: <project id> (<environment>)`. Then this
paragraph:

```markdown
Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.
```

Then a section `## <connection>` for each connection a flow reads from, in
code-point order of the connection's id, or for the one `--connection`
names. When no flow reads from a connection and none is named, the request
says `No flow reads from a connection, so there is nothing to ask for.` instead.

The connection's tables are its flows' tables. Each `object` is resolved for
the environment; a reference that is unset is written as it is, as
`${envvar:NAME}`. The schemas are, for a recipe whose `names.parts` is 2 or
more, the part of each object second from the right, each once, in
code-point order. When the connection has no flow tables (as for a
`--connection` that no flow reads from), when any object has fewer than two
parts, or when that part holds an unset reference, the schemas are not
known: `{schemas}` stays a placeholder, never an empty list.

**Covered.** When the connection's flows read at least one table and the
metadata has an entry for each, the section is:

```markdown
Every table its flows read is in sources/<connection>.yaml:

- `<object>`: <captured.from>, captured <YYYY-MM-DD>
```

with one line for each entry, in code-point order of its `object`, each once.
Nothing is asked for that connection.

**The recipe's step.** Otherwise, when the connection has a recipe, the
section starts with its step:

<!-- prettier-ignore -->
````markdown
- Who: <who>
- Access: <access>
- Recipe: <title> (`<id>`)

Run this query:

```sql
<run>
```

Fill in before use:

- `{<name>}`: <what to write>

Save the result as `<save>`.
````

- A project recipe's line is ``- Recipe: <title> (`<id>`, from `recipes/<id>.yaml`)``.
- With `call` instead of `run`, `Run this query:` is `Call this URL:` and the
  block is a `text` block. `how`, when the recipe gives it, is a paragraph
  after the block. `Save the result as` is `Save the response as`.
- A `sample` recipe has neither: the step says `Save a sample of each table:`.
- When `run`, `call` or `save` holds `{object}`, the block and the save line
  are replaced by a list with one item for each table, in the order of the
  flows and their tables, each `object` once, as below. A `sample` recipe's
  item is the save path alone. When the connection has no flow tables (as
  for a `--connection` that no flow reads from), the block and the save line
  are kept, with `{object}` left as written, and the import line keeps it
  too.

  ```markdown
  - `<run or call, filled>`, saved as `<save, filled>`
  ```

- Every placeholder is filled where its value is known (section 1). The
  list after `Fill in before use:` names, in the order they first appear,
  each that is not: an input the connection does not give, with the input's
  `description`, `{schemas}` when the schemas are not known, with
  `the schemas to describe, each in single quotes and separated by commas, such as 'dbo', 'sales'`,
  and `{object}` when it is left as written, with
  `a table to describe, as a flow's object names it; do this once for each table`.
  With none, the list and its line are left out.

**The alternatives.** Then, after `### If that cannot be done`, these, as
items of a list, for when the step cannot be done. A connection with no
recipe has no step, and its section starts
`No recipe describes this source. Send one of these:` instead of the heading.

<!-- prettier-ignore -->
```markdown
- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as `sources/<connection>/<object>.<csv|json|jsonl|parquet>`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.
  - `sources/<connection>/<object>.csv`
- A data contract (ODCS) for the tables, from the source's team, saved as `sources/<connection>.odcs.yaml`.
- The columns file, saved as `sources/<connection>.columns.csv`, with one row for each column and these fields, in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.
```

The sample item has one line for each table, in the order of the flows and
their tables, each `object` once. A `sample` recipe's connection has no
sample item among its alternatives: its step asks for one already.

**Importing.** The request ends with a section, when it asked for anything:

<!-- prettier-ignore -->
````markdown
## Importing

Import each file you saved, from the project's folder:

```sh
ingestron source import <connection> <file>
```

A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.
````

with one line for each file the recipes' steps save, in the order of the
sections, and, for a connection with no recipe, its columns file. With
`--env`, each line ends `--env <environment>`.

## 5. Drafting contracts

`draftContracts` drafts an ODCS contract for a flow table from its metadata
entry, so that a table that needs a contract (definitions specification,
section 12.5) has one to review. It resolves with `sourceTables: true` and
reads the result's source tables (definitions specification, section 12.7),
with or without a model, and writes nothing.

The tables are those named, as `<flow>.<table>` (the flow's id and the
table's key), in the order given; or, with `needed`, every table that needs a
contract, names none and has a metadata entry, in the order of the source
tables. With `needed`, a table that needs a contract and names none
but has no metadata entry is named:
`"<flow>.<table>" needs a contract but has no entry in the source metadata of "<connection>"; import it first (ingestron source request says how).`
A named table is refused with one of these, and the others are still
drafted:

- `"<flow>.<table>" is not a flow table. Flow tables: <list>.`, with every
  flow table as `<flow>.<table>`, in the order of the source tables,
  joined with `, `;
- `"<flow>.<table>" has no entry in the source metadata of "<connection>"; import it first (ingestron source request says how).`;
- `"<flow>.<table>" already names the contract "<id>".`

Each draft is `contracts/<connection>.<table>.yaml`, with:

- `apiVersion: v3.1.0`, `kind: DataContract`, `id: <connection>.<table>`,
  `version: 0.1.0` and `status: draft`. Table keys are unique in a project,
  so these ids never clash. A draft is an ordinary contract; `status: draft`
  is plain ODCS and changes nothing in Ingestron;
- one `schema` entry, whose `name` is the flow table's key, with
  `logicalType: object`;
- a property for each column of the entry, in order, with its `name`,
  `logicalType`, `logicalTypeOptions` and `required`, and, except for a table
  `captured.from: sample` or `assistant`, `primaryKey: true` and
  `primaryKeyPosition` for a column of the key. Nested `properties` and
  `items` are kept, written the same way. `sourceType` is not carried, and
  neither are a decimal's `precision` and `scale` in `logicalTypeOptions`:
  ODCS 3.1 has no such field, so a contract that had them would fail its
  schema. The comparison reads an option only when both sides give it, so the
  contract's missing precision is never a difference.

It starts with a comment that says where it came from and what to add:

```text
# Drafted from "<object>" in <file> (<captured.from>, captured <YYYY-MM-DD>).
# Review the types, required columns and key, then add descriptions, classifications and checks.
```

where `<file>` is the metadata document's file. A line break in the object or
the file is written as `\n` or `\r`, so that the comment stays on its line.
For a table from a sample or
an assistant, the second line is
`# Review the types and required columns, then add the key, descriptions, classifications and checks.`
The draft is in block style, its keys in the order above and each property's
in the order `name`, `logicalType`, `logicalTypeOptions`, `required`,
`primaryKey`, `primaryKeyPosition`, then `properties` or `items`;
`logicalTypeOptions` is a one-line flow mapping.

```yaml
# Drafted from "ERP.dbo.Customers" in sources/erp.yaml (catalog, captured 2026-11-12).
# Review the types, required columns and key, then add descriptions, classifications and checks.
apiVersion: v3.1.0
kind: DataContract
id: erp.customers
version: 0.1.0
status: draft
schema:
  - name: customers
    logicalType: object
    properties:
      - name: CustomerID
        logicalType: integer
        required: true
        primaryKey: true
        primaryKeyPosition: 1
      - name: Name
        logicalType: string
        logicalTypeOptions: { maxLength: 200 }
        required: false
```

An existing file is never replaced, merged into or refreshed: it is skipped
and named. The table's `contract:` line is never written by the command; it
prints the line to add.

The rules of section 4, "Resolving", apply, so a table's `CONTRACT_NEEDED`,
which the draft is for, does not stop it.

## 6. Commands

Each works on the project in `--definitions` (default `.`).

### `ingestron source request [--connection <id>] [--env <name>]`

Prints the source request (section 4) for the environment `--env` names, or
for no particular environment (`default`). It writes nothing. `--env` is
given at most once.

### `ingestron source import <connection> <file> [--object <text>] [--env <name>] [--dry-run]`

Imports `<file>`, a path relative to the current folder, read as bytes, into
`sources/<connection>.yaml` (section 3). The project's documents are loaded,
not resolved, so a project whose tables have no columns yet can be imported
into. The load tolerates an `${envvar:…}` reference that is set nowhere, as the
request does. It needs only the project's connections, which are the same in
every environment, so it loads for the environment `--env` names or, without
`--env`, for the first environment `project.yaml` declares, and a project whose
values differ by environment loads either way. The command that the request
prints, which carries `--env` only when the request was asked for one, works
as printed. `--env` also records the document's `environment`; without it none
is recorded. Any other loading error stops it, written as `ingestron plan`
writes it. The connection is a Connection of the project (else the message of
section 4, "Resolving"), and its recipe is checked as section 1 says.

A file that is not there, or is not a file, is refused: `There is no file <file>.`
`<file>` is written as it was given.

`source import` takes the connection and the file and nothing more. With fewer
or more arguments, it is a usage mistake whose message is `source import takes a
connection and a file, such as: source import erp sources/erp.catalog.csv.`

It writes `sources/<connection>.yaml` and, when it adds the import, `project.yaml`,
then prints the changes' text (section 3), then
`Wrote sources/<connection>.yaml.` and, when it added the import,
`Added sources/<connection>.yaml to the imports of project.yaml.`

With `--dry-run` it writes nothing and prints the same changes' text, then
`Nothing was written (--dry-run).` A refused file prints each reason on a line
of its own, and nothing is written.

### `ingestron contract --from-metadata <flow>.<table>` and `ingestron contract --from-metadata --needed [--env <name>]`

Drafts the contracts of the tables named, one or more, or with `--needed` of
every table that needs one (section 5), for the environment `--env` names.
For each draft, in order, it prints `Wrote <path>.` or, when the file exists,
`Skipped <path>: it already exists.`; then, for each draft, a skipped one
included, `Add to <flow>.<table>: contract: <id>`; then each problem
(section 5). With `--needed` and nothing to draft and no problem, it prints
`No table needs a contract drafted.` It exits 1 when there is any problem,
and 0 otherwise: a skipped file alone is not a problem.

`--env` is given at most once.

`ingestron contract <sample>` is unchanged.

### Exit codes

| Code | When                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Done, a dry run that would write included. Breaking changes do not change it.                                                                                                                                                                                                                                |
| 1    | A refusal; an unknown connection, flow table or recipe; definitions that cannot be loaded; or definitions with errors that stop the command (section 4, "Resolving").                                                                                                                                        |
| 2    | A usage mistake: `source` without `request` or `import`, `import` without both arguments or with more, `--env` more than once on `source` or on `contract --from-metadata`, `--from-metadata` with neither a table nor `--needed`, or with both, or a flag given to a command it does not belong to (below). |

### Flags

Each flag of this section belongs to one command: `--dry-run` and `--object`
to `source import`; `--connection` to `source request`; `--from-metadata` to
`contract`; and `--needed` to `contract --from-metadata`. Given to any other
command, or `--needed` without `--from-metadata`, it is a usage mistake,
`<flag> is only for <command>.` (`--dry-run is only for source import.`,
`--needed is only for contract --from-metadata.`).
