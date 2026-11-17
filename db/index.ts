import { drizzle } from "drizzle-orm/d1";
import { getReviewBinding } from "#lydra-review-binding";
import * as schema from "./schema";

export function getDb() {
  const binding = getReviewBinding();
  return binding ? drizzle(binding, { schema }) : null;
}
