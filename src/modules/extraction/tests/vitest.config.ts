import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/** B4 tests remain inside B as required by the frozen scope. */
export default defineConfig({
  test: {
    environment: "node", include: ["src/modules/extraction/tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"], testTimeout: 20000, hookTimeout: 30000,
  },
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
});
