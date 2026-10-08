import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountKey: text("account_key").notNull().unique(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["available", "sold"] }).notNull().default("available"),
  createdAt: text("created_at").notNull(),
  soldAt: text("sold_at"),
  version: integer("version").notNull().default(1),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  count: integer("count").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});
