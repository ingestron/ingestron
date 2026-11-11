// A table's hover says where each intent value came from.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hoverAt } from "../src/hover/hover.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates, ordersWithSettings, replaced } from "./starters.js";

const retail = join(filledTemplates, "retail");
const read = (file: string) => readFileSync(join(retail, file), "utf8");

describe("hover on a table: where its intent came from", () => {
  const standard = replaced(
    read("standard.yaml"),
    "naming:",
    "layers:\n  - { name: bronze, history: full }\nnaming:",
  );
  const flow = replaced(
    replaced(
      ordersWithSettings(read("flows/shop.yaml")),
      "source: shop\n",
      "source: shop\nlayer: bronze\n",
    ),
    "    contract: shop.customers\n",
    "    contract: shop.customers\n    sequence: updated_at\n",
  );
  const project = openProject(
    retail,
    new Map([
      [join(retail, "standard.yaml"), standard],
      [join(retail, "flows/shop.yaml"), flow],
    ]),
  );
  const hover = (needle: string, plus = 1) =>
    hoverAt(project, "flows/shop.yaml", flow, flow.indexOf(needle) + plus, "dev")!;

  it("names the layer that set a value, with the line", () => {
    const shown = hover("  customers:", 3);
    expect(shown).toContain("Intent");
    expect(shown).toContain(
      "- `history`: `full`, from the table's layer in the standard (standard.yaml:",
    );
  });

  it("says which setting an aliased value was read from", () => {
    const shown = hover("  orders:", 3);
    expect(shown).toContain('from the setting "mode"');
    expect(shown).toContain("- `sequence`: `updated_at`");
  });

  it("lists only the intent paths the table resolves", () => {
    const shown = hover("  customers:", 3);
    expect(shown).toContain("- `sequence`: `updated_at`, from this table (flows/shop.yaml:");
    expect(shown).not.toContain("`retention");
    expect(shown).not.toContain("`load.deletes");
  });
});
