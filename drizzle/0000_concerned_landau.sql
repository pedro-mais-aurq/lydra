CREATE TABLE `lydra_reviews` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "lydra_reviews_score" CHECK(score between 1 and 5),
	CONSTRAINT "lydra_reviews_note" CHECK(length(note) <= 500)
);
