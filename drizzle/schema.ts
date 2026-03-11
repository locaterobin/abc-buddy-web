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
  // Release data
  releasedAt: timestamp("releasedAt"),
  releaseLatitude: double("releaseLatitude"),
  releaseLongitude: double("releaseLongitude"),
  releaseAreaName: varchar("releaseAreaName", { length: 255 }),
  releaseDistanceMetres: int("releaseDistanceMetres"),
});

export type DogRecord = typeof dogRecords.$inferSelect;
export type InsertDogRecord = typeof dogRecords.$inferInsert;

export const releasePlans = mysqlTable("release_plans", {
  id: int("id").autoincrement().primaryKey(),
  teamIdentifier: varchar("teamIdentifier", { length: 64 }).notNull(),
  planDate: varchar("planDate", { length: 6 }).notNull(), // YYMMDD
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReleasePlan = typeof releasePlans.$inferSelect;
export type InsertReleasePlan = typeof releasePlans.$inferInsert;

export const releasePlanDogs = mysqlTable("release_plan_dogs", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  dogId: varchar("dogId", { length: 32 }).notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type ReleasePlanDog = typeof releasePlanDogs.$inferSelect;
export type InsertReleasePlanDog = typeof releasePlanDogs.$inferInsert;
