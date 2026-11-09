// Which step judges an intent path or audit value (specification sections 11.3 and 11.5),
// for each shape of flow table: an ingest that writes the table, an ingest that lands
// files for a store step, and an ingest whose landed files are the table (`store: none`).
import { describe, expect, it } from "vitest";
import type { Handover, Method } from "../../src/index.js";
import { judgeOf } from "../../src/resolve/judging-step.js";

/** A step, named by its action, with a method that hands over `produces`. */
function step(action: Method["action"], produces: Handover) {
  return { name: action, method: { action, produces } as Method };
}

const shapes = {
  "ingest writes the table": { steps: [step("ingest", "table")], endsAtFiles: false },
  "ingest lands files for a store": {
    steps: [step("ingest", "files"), step("store", "table")],
    endsAtFiles: false,
  },
  "store: none": { steps: [step("ingest", "files")], endsAtFiles: true },
};

/** Paths and audit values, with the step that judges each in every shape. */
const cases: { path: string; value?: string; judge: Record<keyof typeof shapes, string> }[] = [
  ...["load.mode", "load.cursor", "load.deletes.mode", "retention.landed_files"].map((path) => ({
    path,
    judge: {
      "ingest writes the table": "ingest",
      "ingest lands files for a store": "ingest",
      "store: none": "ingest",
    },
  })),
  ...[
    "history",
    "sequence",
    "rescued",
    "retention.time_travel",
    "retention.log",
    "storage.clustering",
    "storage.features",
  ].map((path) => ({
    path,
    judge: {
      "ingest writes the table": "ingest",
      "ingest lands files for a store": "store",
      "store: none": "ingest",
    },
  })),
  ...["loaded_at", "row_hash", "source_file", "source_modified_at"].map((value) => ({
    path: "audit",
    value,
    judge: {
      "ingest writes the table": "ingest",
      "ingest lands files for a store": "store",
      "store: none": "ingest",
    },
  })),
  ...["run_id", "window_start", "window_end", "source_object", "source_connection"].map(
    (value) => ({
      path: "audit",
      value,
      judge: {
        "ingest writes the table": "ingest",
        "ingest lands files for a store": "ingest",
        "store: none": "ingest",
      },
    }),
  ),
];

describe("judgeOf", () => {
  for (const { path, value, judge } of cases)
    for (const [shape, { steps, endsAtFiles }] of Object.entries(shapes))
      it(`${path}${value ? `=${value}` : ""} when ${shape}: ${judge[shape as keyof typeof shapes]}`, () => {
        expect(judgeOf(path, steps, { value, endsAtFiles })?.name).toBe(
          judge[shape as keyof typeof shapes],
        );
      });

  it("judges no audit column without a value, and no path outside the list", () => {
    const { steps } = shapes["ingest lands files for a store"];
    expect(judgeOf("audit", steps)).toBeUndefined();
    expect(judgeOf("operations.trigger", steps)).toBeUndefined();
  });

  it("does not take the ingest step for what is kept unless the table ends at its files", () => {
    // Among steps that give a default (section 11.3), a store that gives none is absent.
    expect(judgeOf("history", [step("ingest", "files")])).toBeUndefined();
  });
});
