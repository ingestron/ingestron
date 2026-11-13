// Whether a type of the source's metadata fits the contract's, and whether it differs
// (specification section 12.6, Types).

/** A logical type with its options, as the contract or the metadata gives it. */
export interface TypeOf {
  logicalType: string;
  options?: Record<string, unknown> | undefined;
}

/**
 * `fits`: every value of the source's type is a value of the contract's; `differs`: they are not
 * the same.
 */
export interface TypeJudgement {
  fits: boolean;
  differs: boolean;
}

/**
 * The options of a number the comparison reads, `scale` counting as 0 for a side that gives a
 * precision.
 */
function digits(options: Record<string, unknown> | undefined): {
  precision?: number;
  scale?: number;
} {
  const precision = numberOf(options?.precision);
  const scale = numberOf(options?.scale) ?? (precision === undefined ? undefined : 0);
  return {
    ...(precision !== undefined && { precision }),
    ...(scale !== undefined && { scale }),
  };
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** True when a type of the source fits the contract's by its logical type alone. */
function typeFits(source: string, contract: string): boolean {
  if (source === contract) return true;
  if (contract === "number") return source === "integer";
  if (contract === "timestamp") return source === "date";
  return contract === "string" && source !== "object" && source !== "array";
}

/**
 * Judges the metadata's type (`source`) against the contract's. A type fits itself, `integer`
 * fits `number`, `date` fits `timestamp`, and any type but `object` and `array` fits `string`.
 * For a number, with `p` and `s` the precision and scale, it fits only when `s_src ≤ s_con`
 * and, when both sides give a precision, `p_src − s_src ≤ p_con − s_con`; for a string, when
 * `maxLength` is not larger. Each option is compared only when both sides give it.
 */
export function judgeType(source: TypeOf, contract: TypeOf): TypeJudgement {
  const differsInType = source.logicalType !== contract.logicalType;
  if (!typeFits(source.logicalType, contract.logicalType)) return { fits: false, differs: true };
  if (contract.logicalType === "number") return judgeNumber(source, contract, differsInType);
  if (contract.logicalType === "string" && source.logicalType === "string")
    return judgeLength(source, contract);
  return { fits: true, differs: differsInType };
}

function judgeNumber(source: TypeOf, contract: TypeOf, differsInType: boolean): TypeJudgement {
  const from = digits(source.options);
  const to = digits(contract.options);
  let fits = true;
  let differs = differsInType;
  if (from.scale !== undefined && to.scale !== undefined) {
    fits &&= from.scale <= to.scale;
    differs ||= from.scale !== to.scale;
  }
  if (from.precision !== undefined && to.precision !== undefined) {
    fits &&= from.precision - from.scale! <= to.precision - to.scale!;
    differs ||= from.precision !== to.precision;
  }
  return { fits, differs };
}

function judgeLength(source: TypeOf, contract: TypeOf): TypeJudgement {
  const from = numberOf(source.options?.maxLength);
  const to = numberOf(contract.options?.maxLength);
  if (from === undefined || to === undefined) return { fits: true, differs: false };
  return { fits: from <= to, differs: from !== to };
}

/**
 * A type as a message says it: `number(18,2)`, `number(scale 2)` for a scale with no precision,
 * `string(200)`, else the logical type.
 */
export function typeText({ logicalType, options }: TypeOf): string {
  if (logicalType === "number") {
    const { precision, scale } = digits(options);
    if (precision !== undefined) return `number(${precision},${scale})`;
    if (scale !== undefined) return `number(scale ${scale})`;
  }
  const length = numberOf(options?.maxLength);
  if (logicalType === "string" && length !== undefined) return `string(${length})`;
  return logicalType;
}
