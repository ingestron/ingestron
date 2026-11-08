/**
 * Safety limits. They stop a malformed or hostile project from exhausting
 * memory; normal projects never come near them.
 */
export interface Limits {
  /** Largest single file, in bytes. */
  maxFileBytes: number;
  /** Longest chain of `${file:…}` references inside one another. */
  maxIncludeDepth: number;
  /** Most YAML alias (`*name`) expansions in one load. */
  maxAliases: number;
  /** Most `${file:…}` references followed in one load, counting repeats. */
  maxIncludes: number;
}

/**
 * The limits used when the caller does not set them.
 * @example
 * loadProject("./definitions", { kinds, limits: { ...defaultLimits, maxIncludes: 5000 } })
 */
export const defaultLimits: Readonly<Limits> = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxIncludeDepth: 32,
  maxAliases: 100,
  maxIncludes: 1000,
});
