import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
// Only the current round and aggregate totals; no history or individual scores.
export const currentRound = sqliteTable("current_round", {
  id: integer("id").primaryKey(), roundId: text("round_id").notNull(),
  title: text("title").notNull(), maxScore: integer("max_score").notNull(),
  durationSeconds: integer("duration_seconds").notNull(), startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(), status: text("status").notNull(),
  total: integer("total").notNull().default(0), count: integer("count").notNull().default(0),
});
