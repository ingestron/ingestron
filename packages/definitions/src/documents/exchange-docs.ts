// The shapes of an ODCS contract and an ODPS data product, as far as they are read.

/** The parts of an ODCS v3.1.0 contract that are used. */
export interface ContractDoc {
  id: string;
  schema?: {
    name: string;
    description?: string;
    properties?: {
      name: string;
      logicalType?: string;
      physicalType?: string;
      required?: boolean;
      primaryKey?: boolean;
      primaryKeyPosition?: number;
      physicalName?: string;
      description?: string;
      /** ODCS quality rules on the column. */
      quality?: unknown;
      unique?: boolean;
      /** Limits for the logical type, such as maxLength, checked on every row. */
      logicalTypeOptions?: unknown;
      tags?: unknown[];
      classification?: string;
    }[];
    /** ODCS quality rules on the whole object. */
    quality?: unknown;
    tags?: unknown[];
  }[];
  roles?: { role: string; access?: string; description?: string; firstLevelApprovers?: string }[];
  slaProperties?: { property: string; value: unknown; unit?: string }[];
}

/** An ODPS data product: the fields Ingestron reads. */
export interface ProductDoc {
  id: string;
  name?: string;
  version?: string;
  domain?: string;
  type?: string;
  status?: string;
  deprecated?: boolean;
  description?: { purpose?: string; usage?: string; limitations?: string };
  team?: { members?: { username: string; name?: string; role?: string }[] };
  support?: { channel: string; url: string; tool?: string }[];
  outputPorts?: { name: string; contractId?: string; description?: string }[];
}
