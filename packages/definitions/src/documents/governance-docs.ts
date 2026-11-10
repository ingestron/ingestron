// The standard's governance section as written (specification sections 8.1 and 8.2).

/**
 * The standard's governance section (specification section 8.1).
 * @public
 */
export interface GovernanceDoc {
  products?: { require?: ("owner" | "purpose" | "support" | "domain")[] };
  classification?: {
    values?: string[];
    columns?: "required" | "optional";
    sensitive?: string[];
    /** The tag key a classification is set as on the platform (section 8.2); the model fills it in. */
    tag?: string;
  };
  access?: {
    sensitive?: { require?: ("access" | "description" | "firstLevelApprovers")[] };
    /** Whether grants also take away what the contracts do not name (section 8.2). */
    grants?: "additive" | "exact";
  };
  /**
   * The mask of each classification: `null`, `hash`, `redact` or a function's name (section
   * 8.2). A YAML null written unquoted is the `null` mask.
   */
  masks?: Record<string, string | null>;
  /** Row filters by name, each a function and the column it is given (section 8.2). */
  filters?: Record<string, { function: string; match: FilterMatch }>;
}

/**
 * The column a row filter is given: by tag key, by tag key and value, or by classification
 * (specification section 8.2).
 * @example { tag: "region" }
 * @public
 */
export type FilterMatch = { tag: string; value?: string } | { classification: string };
