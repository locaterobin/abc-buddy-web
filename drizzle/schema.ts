import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const dogRecords = mysqlTable("dog_records", {
  id: int("id").autoincrement().primaryKey(),
  teamIdentifier: varchar("teamIdentifier", { length: 64 }).notNull(),
  dogId: varchar("dogId", { length: 32 }).notNull(),
  imageUrl: text("imageUrl"),
  originalImageUrl: text("originalImageUrl"),
  description: text("description"),
  notes: text("notes"),
  latitude: double("latitude"),
  longitude: double("longitude"),
  areaName: varchar("areaName", { length: 255 }),
  source: mysqlEnum("source", ["camera", "upload", "api"]).default("upload").notNull(),
  recordedAt: timestamp("recordedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DogRecord = typeof dogRecords.$inferSelect;
export type InsertDogRecord = typeof dogRecords.$inferInsert;
