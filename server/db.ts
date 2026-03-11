import { and, desc, eq, gte, isNotNull, isNull, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, dogRecords, InsertDogRecord, DogRecord, releasePlans, releasePlanDogs } from "../drizzle/schema";
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

export async function getRecordsPaginated(
  teamIdentifier: string,
  opts: {
    page: number;
    pageSize: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: "all" | "active" | "released";
  }
): Promise<{ records: (DogRecord & { inReleasePlan: boolean })[]; total: number; hasMore: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { page, pageSize, search, dateFrom, dateTo, status } = opts;
  const conditions: ReturnType<typeof eq>[] = [eq(dogRecords.teamIdentifier, teamIdentifier)];
  if (search?.trim()) {
    conditions.push(like(dogRecords.dogId, `%${search.trim()}%`) as any);
  }
  if (dateFrom) {
    // Convert IST midnight to UTC ISO string for SQL comparison.
    // We use sql`` with a literal UTC string to bypass mysql2's local-timezone
    // Date serialization (which would shift the boundary by the server's UTC offset).
    const utcStart = new Date(dateFrom + "T00:00:00+05:30").toISOString().replace("T", " ").replace("Z", "");
    conditions.push(sql`${dogRecords.recordedAt} >= ${utcStart}` as any);
  }
  if (dateTo) {
    const utcEnd = new Date(dateTo + "T23:59:59+05:30").toISOString().replace("T", " ").replace("Z", "");
    conditions.push(sql`${dogRecords.recordedAt} <= ${utcEnd}` as any);
  }
  if (status === "released") {
    conditions.push(isNotNull(dogRecords.releasedAt) as any);
  } else if (status === "active") {
    conditions.push(isNull(dogRecords.releasedAt) as any);
  }
  const where = and(...conditions);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dogRecords)
    .where(where);
  const total = Number(countRow?.count ?? 0);
  const rawRecords = await db
    .select()
    .from(dogRecords)
    .where(where)
    .orderBy(desc(dogRecords.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  // Fetch which dogIds are in any release plan
  const dogIds = rawRecords.map((r) => r.dogId);
  let planDogIds = new Set<string>();
  if (dogIds.length > 0) {
    const planRows = await db
      .selectDistinct({ dogId: releasePlanDogs.dogId })
      .from(releasePlanDogs)
      .where(sql`${releasePlanDogs.dogId} IN (${sql.join(dogIds.map((id) => sql`${id}`), sql`, `)})`);
    planDogIds = new Set(planRows.map((r) => r.dogId));
  }
  const records = rawRecords.map((r) => ({ ...r, inReleasePlan: planDogIds.has(r.dogId) }));
  return { records, total, hasMore: page * pageSize < total };
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
  sinceDate?: Date,
  untilDate?: Date
): Promise<DogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(dogRecords.teamIdentifier, teamIdentifier)];
  if (sinceDate) {
    conditions.push(gte(dogRecords.recordedAt, sinceDate));
  }
  if (untilDate) {
    conditions.push(lte(dogRecords.recordedAt, untilDate));
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
    releasePhotoUrl?: string | null;
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
      ...(data.releasePhotoUrl !== undefined ? { releasePhotoUrl: data.releasePhotoUrl } : {}),
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

export async function getRecordDates(teamIdentifier: string): Promise<string[]> {
  // Returns distinct IST dates (YYYY-MM-DD) that have records in the past 30 days
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const utcSince = since30.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
  // Extract date in IST (UTC+5:30) using MySQL CONVERT_TZ
  const rows = await db.execute(
    sql`SELECT DISTINCT DATE(CONVERT_TZ(${dogRecords.recordedAt}, '+00:00', '+05:30')) as ist_date
        FROM ${dogRecords}
        WHERE ${dogRecords.teamIdentifier} = ${teamIdentifier}
          AND ${dogRecords.recordedAt} >= ${utcSince}
        ORDER BY ist_date DESC`
  );
  const result = (rows[0] as unknown) as Array<{ ist_date: string | Date }>;
  return result.map((r) => {
    const d = r.ist_date;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  });
}

// ── Release Plans ──────────────────────────────────────────────────────────────

export async function getReleasePlans(teamIdentifier: string, sinceHours?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(releasePlans.teamIdentifier, teamIdentifier)];
  if (sinceHours !== undefined) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    conditions.push(gte(releasePlans.createdAt, since));
  }
  return db
    .select()
    .from(releasePlans)
    .where(and(...conditions))
    .orderBy(desc(releasePlans.planDate));
}

export async function createReleasePlan(teamIdentifier: string, planDate: string, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Count existing plans for this date+team to get next orderIndex
  const existing = await db
    .select({ id: releasePlans.id })
    .from(releasePlans)
    .where(and(eq(releasePlans.teamIdentifier, teamIdentifier), eq(releasePlans.planDate, planDate)));
  const orderIndex = existing.length + 1;
  const result = await db.insert(releasePlans).values({ teamIdentifier, planDate, orderIndex, notes });
  return (result[0] as any).insertId as number;
}

export async function deleteReleasePlan(planId: number, teamIdentifier: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(releasePlanDogs).where(eq(releasePlanDogs.planId, planId));
  const result = await db
    .delete(releasePlans)
    .where(and(eq(releasePlans.id, planId), eq(releasePlans.teamIdentifier, teamIdentifier)));
  return ((result[0] as any).affectedRows ?? 0) > 0;
}

export async function getReleasePlanDogs(planId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({
      id: releasePlanDogs.id,
      planId: releasePlanDogs.planId,
      dogId: releasePlanDogs.dogId,
      photo2Url: releasePlanDogs.photo2Url,
      addedAt: releasePlanDogs.addedAt,
      recordId: dogRecords.id,
      imageUrl: dogRecords.imageUrl,
      description: dogRecords.description,
      areaName: dogRecords.areaName,
      latitude: dogRecords.latitude,
      longitude: dogRecords.longitude,
      recordedAt: dogRecords.recordedAt,
      releasedAt: dogRecords.releasedAt,
      releasePhotoUrl: dogRecords.releasePhotoUrl,
    })
    .from(releasePlanDogs)
    .leftJoin(dogRecords, eq(releasePlanDogs.dogId, dogRecords.dogId))
    .where(eq(releasePlanDogs.planId, planId))
    .orderBy(releasePlanDogs.addedAt);
  return rows;
}

export async function addDogToReleasePlan(planId: number, dogId: string, photo2Url?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(releasePlanDogs)
    .where(and(eq(releasePlanDogs.planId, planId), eq(releasePlanDogs.dogId, dogId)))
    .limit(1);
  if (existing.length > 0) {
    // Update photo2Url if provided even if already in plan
    if (photo2Url) {
      await db
        .update(releasePlanDogs)
        .set({ photo2Url })
        .where(and(eq(releasePlanDogs.planId, planId), eq(releasePlanDogs.dogId, dogId)));
    }
    return false;
  }
  await db.insert(releasePlanDogs).values({ planId, dogId, photo2Url });
  return true;
}

export async function removeDogFromReleasePlan(planId: number, dogId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .delete(releasePlanDogs)
    .where(and(eq(releasePlanDogs.planId, planId), eq(releasePlanDogs.dogId, dogId)));
  return ((result[0] as any).affectedRows ?? 0) > 0;
}

export async function getDogReleasePlans(dogId: string): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ planId: releasePlanDogs.planId })
    .from(releasePlanDogs)
    .where(eq(releasePlanDogs.dogId, dogId));
  return rows.map((r) => r.planId);
}
