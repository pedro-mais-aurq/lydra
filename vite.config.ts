import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import hosting from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());
  const managed = readExecutionProfile() === "managed-linux";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: managed ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : undefined,
    resolve: {
      alias: {
        "#lydra-review-binding": fileURLToPath(new URL("./db/review-binding.cloudflare.ts", import.meta.url)),
      },
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managed }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: [{
            binding: hosting.d1,
            database_name: "lydra-reviews",
            database_id: "00000000-0000-4000-8000-000000000000",
          }],
        },
      }),
    ],
  };
});
