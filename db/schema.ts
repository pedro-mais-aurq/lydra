import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviews = sqliteTable("lydra_reviews", {
  ownerId: text("owner_id").primaryKey(),
  score: integer("score").notNull(),
  note: text("note").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("lydra_reviews_score", sql.raw("score between 1 and 5")),
  check("lydra_reviews_note", sql.raw("length(note) <= 500")),
]);
