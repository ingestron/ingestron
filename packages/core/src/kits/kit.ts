// Kits: published, dated standards. A kit is a folder holding a small complete project and
// kit.yaml, which says what the kit is. The rules are in spec/cli/kits.md.

/**
 * A kit: a dated Standard with a Platform skeleton and a small project, read from its kit.yaml.
 * @public
 */
export interface Kit {
  /** `<platform>/<name>`, such as `databricks/lakehouse-streaming`. */
  id: string;
  /** `YYYY-MM-DD`, or `YYYY-MM-DD-preview`. */
  version: string;
  /** The kit's name, as it is listed. */
  title: string;
  /** One sentence on what the kit sets up. */
  summary: string;
  /** The packs the kit uses, such as `databricks@2`. */
  packs: string[];
  /** `preview` exactly when the version ends in `-preview`. */
  features: "ga" | "preview";
  /** The Ingestron versions the kit works with: `>=X.Y.Z`, `^X.Y.Z` or `~X.Y.Z`. */
  requires: { ingestron: string };
  /** GitHub teams or users who look after the kit. */
  maintainers: string[];
  /** The previous version of this kit, or null. */
  replaces: string | null;
  /** What changed from `replaces`, in plain words. */
  notes: string;
  /** The kit's folder, as given to `readKit`. */
  folder: string;
}

/**
 * kit.yaml's schema, for editors; `readKit` checks the same rules and more.
 * @public
 */
export const kitSchema = {
  title: "Ingestron kit",
  type: "object",
  additionalProperties: false,
  required: ["id", "version", "title", "summary", "packs", "features", "requires"],
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(-[a-z0-9]+)*/[a-z][a-z0-9]*(-[a-z0-9]+)*$",
      description:
        "<platform>/<name>, in lower-case words joined by '-'. The platform is the first pack's id.",
    },
    version: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}(-preview)?$",
      description:
        "The day the kit's features were checked against the packs: YYYY-MM-DD, or YYYY-MM-DD-preview when it uses preview features.",
    },
    title: { type: "string", description: "The kit's name, as it is listed." },
    summary: { type: "string", description: "One sentence on what the kit sets up." },
    packs: {
      type: "array",
      minItems: 1,
      items: { type: "string", pattern: "^[a-z][a-z0-9-]*@\\d+$" },
      description: "The packs the kit uses, each with its major version, such as databricks@2.",
    },
    features: {
      enum: ["ga", "preview"],
      description: "'preview' exactly when the version ends in -preview.",
    },
    requires: {
      type: "object",
      additionalProperties: false,
      required: ["ingestron"],
      properties: {
        ingestron: {
          type: "string",
          pattern: "^(>=|\\^|~)\\d+\\.\\d+\\.\\d+$",
          description: "The Ingestron versions the kit works with: >=X.Y.Z, ^X.Y.Z or ~X.Y.Z.",
        },
      },
    },
    maintainers: {
      type: "array",
      items: { type: "string" },
      description: "GitHub teams or users who look after the kit.",
    },
    replaces: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}(-preview)?$",
      description: "The previous version of this kit, or null.",
    },
    notes: { type: "string", description: "What changed from `replaces`, in plain words." },
  },
};
