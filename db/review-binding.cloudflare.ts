import { env } from "cloudflare:workers";

export function getReviewBinding(): Cloudflare.Env["DB"] {
  return env.DB;
}
