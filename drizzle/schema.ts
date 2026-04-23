import { boolean, double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  district: varchar("district", { length: 255 }),   // e.g. "Kangra" — hidden from UI
  adminArea: varchar("adminArea", { length: 255 }),  // e.g. "Himachal Pradesh, India" — hidden from UI
  source: mysqlEnum("source", ["camera", "upload", "api"]).default("upload").notNull(),
  gender: mysqlEnum("gender", ["Unknown", "Male", "Female"]).default("Unknown"),
  recordedAt: timestamp("recordedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Staff who added the record
  addedByStaffId: varchar("addedByStaffId", { length: 64 }),
  addedByStaffName: varchar("addedByStaffName", { length: 128 }),
  // Staff who last updated the record
  updatedByStaffId: varchar("updatedByStaffId", { length: 64 }),
  updatedByStaffName: varchar("updatedByStaffName", { length: 128 }),
  updatedAt: timestamp("updatedAt"),
  // Release data
  releasedAt: timestamp("releasedAt"),
  releaseLatitude: double("releaseLatitude"),
  releaseLongitude: double("releaseLongitude"),
  releaseAreaName: varchar("releaseAreaName", { length: 255 }),
  releaseDistanceMetres: int("releaseDistanceMetres"),
  photo2Url: text("photo2Url"), // optional checked photo (persists across plan changes)
  releasePhotoUrl: text("releasePhotoUrl"), // optional 3rd photo taken at release
  // Staff who marked as released
  releasedByStaffId: varchar("releasedByStaffId", { length: 64 }),
  releasedByStaffName: varchar("releasedByStaffName", { length: 128 }),
  // Released far from capture location (beyond team threshold)
  releasedFar: boolean("releasedFar").default(false),
  // Soft delete
  deleted: boolean("deleted").default(false).notNull(),
});

export type DogRecord = typeof dogRecords.$inferSelect;
export type InsertDogRecord = typeof dogRecords.$inferInsert;

export const releasePlans = mysqlTable("release_plans", {
  id: int("id").autoincrement().primaryKey(),
  teamIdentifier: varchar("teamIdentifier", { length: 64 }).notNull(),
  planDate: varchar("planDate", { length: 6 }).notNull(), // YYMMDD
  orderIndex: int("orderIndex").notNull().default(1), // 1-based per day per team
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  firstReleasedAt: timestamp("firstReleasedAt"),
  lastReleasedAt: timestamp("lastReleasedAt"),
  archivedAt: timestamp("archivedAt"),
});

export type ReleasePlan = typeof releasePlans.$inferSelect;
export type InsertReleasePlan = typeof releasePlans.$inferInsert;

export const releasePlanDogs = mysqlTable("release_plan_dogs", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  dogId: varchar("dogId", { length: 32 }).notNull(),
  photo2Url: text("photo2Url"), // optional second photo added when adding to plan
  sortOrder: int("sortOrder").notNull().default(0), // for drag-to-reorder
  addedAt: timestamp("addedAt").defaultNow().notNull(),
  // Staff who added to plan
  addedByStaffId: varchar("addedByStaffId", { length: 64 }),
  addedByStaffName: varchar("addedByStaffName", { length: 128 }),
});

export type ReleasePlanDog = typeof releasePlanDogs.$inferSelect;
export type InsertReleasePlanDog = typeof releasePlanDogs.$inferInsert;

export const teamSettings = mysqlTable("team_settings", {
  id: int("id").autoincrement().primaryKey(),
  teamIdentifier: varchar("teamIdentifier", { length: 64 }).notNull().unique(),
  docxTemplateUrl: text("docxTemplateUrl"),
  releaseFarThreshold: int("releaseFarThreshold").default(200), // metres, default 200m
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamSettings = typeof teamSettings.$inferSelect;

export const loginAttempts = mysqlTable("login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull(),
  email: varchar("email", { length: 320 }),
  success: boolean("success").default(false).notNull(),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
});

export type LoginAttempt = typeof loginAttempts.$inferSelect;

export const blockedIps = mysqlTable("blocked_ips", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull().unique(),
  blockedAt: timestamp("blockedAt").defaultNow().notNull(),
  reason: varchar("reason", { length: 255 }).default("Too many failed login attempts").notNull(),
  unblockedAt: timestamp("unblockedAt"), // null = permanently blocked until manual unblock
});

export type BlockedIp = typeof blockedIps.$inferSelect;
