// Problems that stop a plan from being applied, or an apply from finishing.

/** What went wrong. Each code is explained in README.md. */
export type ProblemCode =
  | "BAD_PATH"
  | "BAD_MANIFEST"
  | "PLAN_HAS_CONFLICTS"
  | "LOCKED"
  | "CHANGED_SINCE_PLAN"
  | "WRITE_FAILED";

/**
 * One problem, with the path it concerns when there is one.
 * @example
 * { code: "BAD_PATH", path: "../x.yml", message: '"../x.yml" leaves the output folder.' }
 */
export interface Problem {
  code: ProblemCode;
  path?: string;
  message: string;
}

/** Shorthand for building a problem. */
export function problem(code: ProblemCode, message: string, path?: string): Problem {
  return path === undefined ? { code, message } : { code, path, message };
}
