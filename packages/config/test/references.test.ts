import { describe, expect, it } from "vitest";
import { parseDefinitionString } from "../src/references.js";

describe("parseDefinitionString", () => {
  it("returns plain text as a single text segment", () => {
    expect(parseDefinitionString("raw_orders")).toEqual({
      ok: true,
      segments: [{ type: "text", text: "raw_orders" }],
    });
  });

  it("splits text and references", () => {
    const result = parseDefinitionString("raw_${environment.name}_orders");
    expect(result).toEqual({
      ok: true,
      segments: [
        { type: "text", text: "raw_" },
        {
          type: "reference",
          source: "${environment.name}",
          expression: { type: "path", root: "environment", path: ["name"] },
        },
        { type: "text", text: "_orders" },
      ],
    });
  });

  it("reads resolvers and trims spaces", () => {
    const result = parseDefinitionString("${ file: ./a.yaml#/x }");
    expect(result).toEqual({
      ok: true,
      segments: [
        {
          type: "reference",
          source: "${ file: ./a.yaml#/x }",
          expression: { type: "resolver", resolver: "file", argument: "./a.yaml#/x" },
        },
      ],
    });
  });

  it("turns $${ into a literal ${", () => {
    expect(parseDefinitionString("a_$${bundle.target}")).toEqual({
      ok: true,
      segments: [{ type: "text", text: "a_${bundle.target}" }],
    });
  });

  it.each([
    ["${bundle.target}", "${bundle.target}"],
    ["${var}", "${var}"],
    ["${hiveconf:x}", "${hiveconf:x}"],
    ["${values}", "${values}"],
    ["${values.}", "${values.}"],
    ["x ${{ github.ref }} y", "${{ github.ref }}"],
  ])("refuses %s, listing the forms and the escape", (text, snippet) => {
    expect(parseDefinitionString(text)).toEqual({
      ok: false,
      code: "UNKNOWN_REFERENCE",
      message: `"${snippet}" is not a reference.`,
      hint:
        "A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, " +
        "${file:<path>}, ${envvar:<name>} or ${secret:<name>}. " +
        `To keep "${snippet}" as text, write "$${snippet}".`,
    });
  });

  it.each([
    ["${value.price}", "${values.price}"],
    ["${enviroment.name}", "${environment.name}"],
    ["${secrets:db-password}", "${secret:db-password}"],
  ])("suggests the near reference for %s", (text, near) => {
    expect(parseDefinitionString(text)).toMatchObject({
      message: `"${text}" is not a reference. Did you mean "${near}"?`,
    });
  });

  it("refuses a reference without a closing brace", () => {
    expect(parseDefinitionString("cost ${values.price")).toMatchObject({
      ok: false,
      code: "UNCLOSED_REFERENCE",
    });
  });
});
