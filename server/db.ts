import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, dogRecords, InsertDogRecord, DogRecord } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Dog Record Helpers ───

export async function getNextDogIdSuffix(teamIdentifier: string, datePrefix: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const pattern = `${datePrefix}-%`;
  const result = await db
    .select({ dogId: dogRecords.dogId })
    .from(dogRecords)
    .where(and(eq(dogRecords.teamIdentifier, teamIdentifier), like(dogRecords.dogId, pattern)))
    .orderBy(desc(dogRecords.dogId))
    .limit(1);

  if (result.length === 0) return "001";

  const lastId = result[0].dogId;
  const suffix = parseInt(lastId.split("-")[1], 10);
  return String(suffix + 1).padStart(3, "0");
}

export async function checkDogIdExists(teamIdentifier: string, dogId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({ id: dogRecords.id })
    .from(dogRecords)
    .where(and(eq(dogRecords.teamIdentifier, teamIdentifier), eq(dogRecords.dogId, dogId)))
    .limit(1);

  return result.length > 0;
}

export async function insertDogRecord(record: InsertDogRecord): Promise<DogRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [insertResult] = await db.insert(dogRecords).values(record).$returningId();
  const [newRecord] = await db
    .select()
    .from(dogRecords)
    .where(eq(dogRecords.id, insertResult.id))
    .limit(1);

  return newRecord;
}

export async function getRecordsByTeam(teamIdentifier: string): Promise<DogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(dogRecords)
    .where(eq(dogRecords.teamIdentifier, teamIdentifier))
    .orderBy(desc(dogRecords.createdAt));
}

export async function getRecordsByTeamWithTimeRange(
  teamIdentifier: string,
  sinceDate?: Date
): Promise<DogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(dogRecords.teamIdentifier, teamIdentifier)];
  if (sinceDate) {
    conditions.push(gte(dogRecords.recordedAt, sinceDate));
  }

  return db
    .select()
    .from(dogRecords)
    .where(and(...conditions))
    .orderBy(desc(dogRecords.recordedAt));
}

export async function deleteRecordById(id: number, teamIdentifier: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(dogRecords)
    .where(and(eq(dogRecords.id, id), eq(dogRecords.teamIdentifier, teamIdentifier)));

  return (result[0] as any).affectedRows > 0;
}

export async function saveReleaseData(
  id: number,
  teamIdentifier: string,
  data: {
    releasedAt: Date;
    releaseLatitude: number | null;
    releaseLongitude: number | null;
    releaseAreaName: string | null;
    releaseDistanceMetres: number | null;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(dogRecords)
    .set({
      releasedAt: data.releasedAt,
      releaseLatitude: data.releaseLatitude,
      releaseLongitude: data.releaseLongitude,
      releaseAreaName: data.releaseAreaName,
      releaseDistanceMetres: data.releaseDistanceMetres,
    })
    .where(and(eq(dogRecords.id, id), eq(dogRecords.teamIdentifier, teamIdentifier)));

  return (result[0] as any).affectedRows > 0;
}

export async function getRecordByDogId(dogId: string, teamIdentifier: string): Promise<DogRecord | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(dogRecords)
    .where(and(eq(dogRecords.dogId, dogId), eq(dogRecords.teamIdentifier, teamIdentifier)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}
