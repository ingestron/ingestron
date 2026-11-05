// init on an eighth of every connector, connectivity and route (see init-sweep.ts).
import { describe, it } from "vitest";
import { createsWithPlaceholders, fillsEveryName, part } from "./init-sweep.js";

describe("init on every connector, connectivity and route", () => {
  it.each(part(3, 8))(
    "creates $connector ($connectivity) via $via with REPLACE_ME, and --set fills every name",
    (combination) => {
      const { files } = createsWithPlaceholders(combination);
      fillsEveryName(combination, files);
    },
  );
});
