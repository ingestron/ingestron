// The package exports only the command's own API; what the command is built on
// is imported from @ingestron/core.
import { describe, expect, it } from "vitest";
import * as cli from "../src/index.js";

describe("@ingestron/cli's exports", () => {
  it("are run and the command's arguments and options", () => {
    expect(Object.keys(cli).sort()).toEqual(["commands", "flags", "run"]);
  });
});
