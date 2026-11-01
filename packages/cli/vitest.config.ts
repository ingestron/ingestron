import { defineConfig } from "vitest/config";

export default defineConfig({
  // Separate processes: the DuckDB tests change the working folder, which worker threads cannot.
  test: { include: ["test/**/*.test.ts"], pool: "forks" },
});
