// What each problem with an output folder means and how to fix it, for the reference that lists them.
import type { ProblemCode } from "@ingestron/generate";

/**
 * What a problem with an output folder means, how to fix it, and which command reports it.
 * @public
 */
export interface ProblemHelp {
  /** What the code means. */
  meaning: string;
  /** How to fix it. */
  fix: string;
  /** The command that reports it: `plan` finds it while planning, `apply` while writing. */
  reportedBy: "plan" | "apply";
}

/**
 * Every code of a problem with an output folder, with its meaning, fix and the command that reports it.
 * @example
 * problemHelp.LOCKED.reportedBy;
 * @public
 */
export const problemHelp: Record<ProblemCode, ProblemHelp> = {
  BAD_PATH: {
    meaning:
      "A file Ingestron would write has a path the output folder cannot hold: it is not a relative path, contains `\\`, `:` or a NUL character, has an empty, `.` or `..` part, is the manifest or lock file, is inside a `.git` folder, or differs from another path only in letter case.",
    fix: "Change the name or setting that produces the path, then plan again.",
    reportedBy: "plan",
  },
  BAD_MANIFEST: {
    meaning:
      "The output folder's `.generated.json` cannot be read, or lists a path the folder cannot hold. No changes are planned for that folder.",
    fix: "Restore it from version control, or delete it to start again.",
    reportedBy: "plan",
  },
  FIRST_WRITE: {
    meaning:
      "A pack refused to write a file that was never generated in this output folder; the message says why. The plan is not clean, and `apply` writes nothing to that folder.",
    fix: "Do what the message says, then plan again.",
    reportedBy: "plan",
  },
  PLAN_HAS_CONFLICTS: {
    meaning:
      "`apply` was given a plan that is not clean: a file was changed by hand or already exists and was never generated here, or the plan has a problem.",
    fix: "Resolve what `plan` reports, then plan again.",
    reportedBy: "apply",
  },
  LOCKED: {
    meaning: "Another generation is writing to the output folder: `.generated.lock` exists.",
    fix: "Wait for the other generation to finish. If none is running, delete `.generated.lock`.",
    reportedBy: "apply",
  },
  CHANGED_SINCE_PLAN: {
    meaning: "A file or the manifest changed after planning, so nothing was written.",
    fix: "Plan again.",
    reportedBy: "apply",
  },
  WRITE_FAILED: {
    meaning:
      "Writing or removing a file failed. The message says whether every file already changed was put back.",
    fix: "Fix the cause the message gives, such as a read-only folder or a full disk, then apply again.",
    reportedBy: "apply",
  },
};
