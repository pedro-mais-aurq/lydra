declare namespace Cloudflare {
  interface Env {
    DB?: import("@cloudflare/workers-types/index").D1Database;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
