import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, dogRecords, InsertDogRecord, DogRecord, releasePlans, releasePlanDogs, teamSettings } from "../drizzle/schema";
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

export async function getNextDogIdSuffix(teamIdentifier: string, datePrefix: string, planLetter?: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If a plan letter is provided, scope the counter to that plan (e.g. 20260324A-)
  // Otherwise fall back to the legacy format (20260324-)
  const prefix = planLetter ? `${datePrefix}${planLetter}` : datePrefix;
  const pattern = `${prefix}-%`;
  const result = await db
    .select({ dogId: dogRecords.dogId })
    .from(dogRecords)
    .where(and(eq(dogRecords.teamIdentifier, teamIdentifier), like(dogRecords.dogId, pattern)))
    .orderBy(desc(dogRecords.dogId))
    .limit(1);

  if (result.length === 0) return "001";

  const lastId = result[0].dogId;
  // Serial is always the part after the last "-"
  const parts = lastId.split("-");
  const suffix = parseInt(parts[parts.length - 1], 10);
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

export async function updateDogRecord(
  id: number,
  teamIdentifier: string,
  data: {
    dogId?: string;
    description?: string | null;
    notes?: string | null;
    areaName?: string | null;
    district?: string | null;
    adminArea?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    recordedAt?: Date;
    gender?: "Unknown" | "Male" | "Female";
    updatedByStaffId?: string | null;
    updatedByStaffName?: string | null;
    updatedAt?: Date;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(dogRecords)
    .set(data)
    .where(and(eq(dogRecords.id, id), eq(dogRecords.teamIdentifier, teamIdentifier)));
  return (result[0] as any).affectedRows > 0;
}

export async function updateDogRecordAnnotation(
  id: number,
  imageUrl: string,
  originalImageUrl: string | null,
  description: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(dogRecords)
    .set({ imageUrl, originalImageUrl, description })
    .where(eq(dogRecords.id, id));
}

export async function getRecordsPaginated(
  teamIdentifier: string,
  opts: {
    page: number;
    pageSize: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    releasedDateFrom?: string;
    releasedDateTo?: string;
    status?: "all" | "active" | "released";
  }
): Promise<{ records: (DogRecord & { inReleasePlan: boolean })[]; total: number; hasMore: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { page, pageSize, search, dateFrom, dateTo, releasedDateFrom, releasedDateTo, status } = opts;
  const conditions: ReturnType<typeof eq>[] = [eq(dogRecords.teamIdentifier, teamIdentifier), eq(dogRecords.deleted, false) as any];
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
  if (releasedDateFrom) {
    const utcStart = new Date(releasedDateFrom + "T00:00:00+05:30").toISOString().replace("T", " ").replace("Z", "");
    conditions.push(sql`${dogRecords.releasedAt} >= ${utcStart}` as any);
  }
  if (releasedDateTo) {
    const utcEnd = new Date(releasedDateTo + "T23:59:59+05:30").toISOString().replace("T", " ").replace("Z", "");
    conditions.push(sql`${dogRecords.releasedAt} <= ${utcEnd}` as any);
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
  let inPlanSet = new Set<string>();
  if (dogIds.length > 0) {
    const planRows = await db
      .select({ dogId: releasePlanDogs.dogId })
      .from(releasePlanDogs)
      .where(sql`${releasePlanDogs.dogId} IN (${sql.join(dogIds.map((id) => sql`${id}`), sql`, `)})`)
    for (const row of planRows) {
      inPlanSet.add(row.dogId);
    }
  }
  // photo2Url now lives on dog_records itself
  const records = rawRecords.map((r) => ({
    ...r,
    inReleasePlan: inPlanSet.has(r.dogId),
    // photo2Url is already on r from dog_records select
  }));
  return { records, total, hasMore: page * pageSize < total };
}

export async function getRecordsByTeam(teamIdentifier: string): Promise<DogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(dogRecords)
    .where(and(eq(dogRecords.teamIdentifier, teamIdentifier), eq(dogRecords.deleted, false)))
    .orderBy(desc(dogRecords.createdAt));
}

export async function getRecordsByTeamWithTimeRange(
  teamIdentifier: string,
  sinceDate?: Date,
  untilDate?: Date
): Promise<DogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(dogRecords.teamIdentifier, teamIdentifier), eq(dogRecords.deleted, false) as any];
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
    .update(dogRecords)
    .set({ deleted: true })
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
    releasedByStaffId?: string | null;
    releasedByStaffName?: string | null;
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
      ...(data.releasedByStaffId !== undefined ? { releasedByStaffId: data.releasedByStaffId } : {}),
      ...(data.releasedByStaffName !== undefined ? { releasedByStaffName: data.releasedByStaffName } : {}),
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
    .where(and(eq(dogRecords.dogId, dogId), eq(dogRecords.teamIdentifier, teamIdentifier), eq(dogRecords.deleted, false)))
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
          AND ${dogRecords.deleted} = 0
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

export async function getDogIdByRecordId(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ dogId: dogRecords.dogId }).from(dogRecords).where(eq(dogRecords.id, id)).limit(1);
  return rows[0]?.dogId ?? null;
}

export async function getReleasePlans(teamIdentifier: string, sinceHours?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [
    eq(releasePlans.teamIdentifier, teamIdentifier),
    isNull(releasePlans.archivedAt), // exclude archived plans
  ];
  if (sinceHours !== undefined) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    conditions.push(gte(releasePlans.createdAt, since));
  }
  const plans = await db
    .select()
    .from(releasePlans)
    .where(and(...conditions))
    .orderBy(desc(releasePlans.planDate));

  // Enrich each plan with dog counts
  const enriched = await Promise.all(
    plans.map(async (plan) => {
      const planDogs = await db
        .select({ dogId: releasePlanDogs.dogId })
        .from(releasePlanDogs)
        .where(eq(releasePlanDogs.planId, plan.id));
      const totalDogs = planDogs.length;
      let releasedDogs = 0;
      if (totalDogs > 0) {
        const dogIds = planDogs.map((d) => d.dogId);
        const released = await db
          .select({ dogId: dogRecords.dogId })
          .from(dogRecords)
          .where(and(inArray(dogRecords.dogId, dogIds), isNotNull(dogRecords.releasedAt)));
        releasedDogs = released.length;
      }
      return { ...plan, totalDogs, releasedDogs };
    })
  );
  return enriched;
}

// Called after a dog in a plan is released — updates first/last release timestamps only
export async function updatePlanAfterRelease(planId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  // Get current plan to check firstReleasedAt
  const plan = await db
    .select({ firstReleasedAt: releasePlans.firstReleasedAt })
    .from(releasePlans)
    .where(eq(releasePlans.id, planId))
    .limit(1);

  const updateData: Record<string, unknown> = {
    lastReleasedAt: now,
  };
  if (!plan[0]?.firstReleasedAt) {
    updateData.firstReleasedAt = now;
  }

  await db.update(releasePlans).set(updateData).where(eq(releasePlans.id, planId));
}

// Manually archive a plan
export async function archiveReleasePlan(planId: number, teamIdentifier: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(releasePlans)
    .set({ archivedAt: new Date() })
    .where(and(eq(releasePlans.id, planId), eq(releasePlans.teamIdentifier, teamIdentifier)));
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

export async function getReleasePlanDogs(planId: number, teamIdentifier?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({
      // release_plan_dogs fields
      planDogId: releasePlanDogs.id,
      planId: releasePlanDogs.planId,
      addedAt: releasePlanDogs.addedAt,
      sortOrder: releasePlanDogs.sortOrder,
      // full dog_records fields
      id: dogRecords.id,
      dogId: dogRecords.dogId,
      teamIdentifier: dogRecords.teamIdentifier,
      imageUrl: dogRecords.imageUrl,
      photo2Url: dogRecords.photo2Url, // now lives on dog_records
      description: dogRecords.description,
      areaName: dogRecords.areaName,
      latitude: dogRecords.latitude,
      longitude: dogRecords.longitude,
      recordedAt: dogRecords.recordedAt,
      releasedAt: dogRecords.releasedAt,
      releasePhotoUrl: dogRecords.releasePhotoUrl,
      releaseLatitude: dogRecords.releaseLatitude,
      releaseLongitude: dogRecords.releaseLongitude,
      releaseAreaName: dogRecords.releaseAreaName,
      releaseDistanceMetres: dogRecords.releaseDistanceMetres,
      notes: dogRecords.notes,
      gender: dogRecords.gender,
      createdAt: dogRecords.createdAt,
      addedByStaffId: dogRecords.addedByStaffId,
      addedByStaffName: dogRecords.addedByStaffName,
      updatedByStaffId: dogRecords.updatedByStaffId,
      updatedByStaffName: dogRecords.updatedByStaffName,
      updatedAt: dogRecords.updatedAt,
      releasedByStaffId: dogRecords.releasedByStaffId,
      releasedByStaffName: dogRecords.releasedByStaffName,
      planAddedByStaffId: releasePlanDogs.addedByStaffId,
      planAddedByStaffName: releasePlanDogs.addedByStaffName,
    })
    .from(releasePlanDogs)
    .innerJoin(dogRecords, eq(releasePlanDogs.dogId, dogRecords.dogId))
    .where(
      teamIdentifier
        ? and(eq(releasePlanDogs.planId, planId), eq(dogRecords.teamIdentifier, teamIdentifier))
        : eq(releasePlanDogs.planId, planId)
    )
    .orderBy(releasePlanDogs.sortOrder, releasePlanDogs.addedAt);
  return rows;
}

export async function getFullRecordByDogId(dogId: string, teamIdentifier?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({
      planDogId: releasePlanDogs.id,
      planId: releasePlanDogs.planId,
      addedAt: releasePlanDogs.addedAt,
      id: dogRecords.id,
      dogId: dogRecords.dogId,
      teamIdentifier: dogRecords.teamIdentifier,
      imageUrl: dogRecords.imageUrl,
      photo2Url: dogRecords.photo2Url, // now lives on dog_records
      description: dogRecords.description,
      areaName: dogRecords.areaName,
      latitude: dogRecords.latitude,
      longitude: dogRecords.longitude,
      recordedAt: dogRecords.recordedAt,
      releasedAt: dogRecords.releasedAt,
      releasePhotoUrl: dogRecords.releasePhotoUrl,
      releaseLatitude: dogRecords.releaseLatitude,
      releaseLongitude: dogRecords.releaseLongitude,
      releaseAreaName: dogRecords.releaseAreaName,
      releaseDistanceMetres: dogRecords.releaseDistanceMetres,
      notes: dogRecords.notes,
      gender: dogRecords.gender,
      createdAt: dogRecords.createdAt,
      addedByStaffId: dogRecords.addedByStaffId,
      addedByStaffName: dogRecords.addedByStaffName,
      updatedByStaffId: dogRecords.updatedByStaffId,
      updatedByStaffName: dogRecords.updatedByStaffName,
      updatedAt: dogRecords.updatedAt,
      releasedByStaffId: dogRecords.releasedByStaffId,
      releasedByStaffName: dogRecords.releasedByStaffName,
    })
    .from(dogRecords)
    .leftJoin(releasePlanDogs, eq(releasePlanDogs.dogId, dogRecords.dogId))
    .where(and(
      eq(dogRecords.dogId, dogId),
      eq(dogRecords.deleted, false),
      ...(teamIdentifier ? [eq(dogRecords.teamIdentifier, teamIdentifier)] : [])
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateCheckedPhotoUrl(dogId: string, photo2Url: string, teamIdentifier?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = teamIdentifier
    ? and(eq(dogRecords.dogId, dogId), eq(dogRecords.teamIdentifier, teamIdentifier))
    : eq(dogRecords.dogId, dogId);
  await db.update(dogRecords).set({ photo2Url }).where(conditions);
}

export async function addDogToReleasePlan(planId: number, dogId: string, photo2Url?: string, staffId?: string | null, staffName?: string | null): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(releasePlanDogs)
    .where(and(eq(releasePlanDogs.planId, planId), eq(releasePlanDogs.dogId, dogId)))
    .limit(1);
  if (existing.length > 0) {
    // Update photo2Url on dog_records if a new one is provided
    if (photo2Url) {
      await db
        .update(dogRecords)
        .set({ photo2Url })
        .where(eq(dogRecords.dogId, dogId));
    }
    return false;
  }
  // Assign sortOrder as max + 1 for this plan
  const allRows = await db
    .select({ s: releasePlanDogs.sortOrder })
    .from(releasePlanDogs)
    .where(eq(releasePlanDogs.planId, planId));
  const maxSort = allRows.length > 0 ? Math.max(...allRows.map((r) => r.s)) : -1;
  // Insert plan-dog row (no photo2Url here anymore)
  await db.insert(releasePlanDogs).values({ planId, dogId, sortOrder: maxSort + 1, addedByStaffId: staffId ?? null, addedByStaffName: staffName ?? null });
  // Save photo2Url on the dog record itself so it persists across plan changes
  if (photo2Url) {
    await db
      .update(dogRecords)
      .set({ photo2Url })
      .where(eq(dogRecords.dogId, dogId));
  }
  return true;
}

export async function reorderPlanDogs(planId: number, orderedDogIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let i = 0; i < orderedDogIds.length; i++) {
    await db
      .update(releasePlanDogs)
      .set({ sortOrder: i })
      .where(and(eq(releasePlanDogs.planId, planId), eq(releasePlanDogs.dogId, orderedDogIds[i])));
  }
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

/** Returns the plan(s) a dog is currently in, with plan label info */
export async function getDogPlanDetails(dogId: string): Promise<{ planId: number; planDate: string; orderIndex: number; teamIdentifier: string }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({
      planId: releasePlanDogs.planId,
      planDate: releasePlans.planDate,
      orderIndex: releasePlans.orderIndex,
      teamIdentifier: releasePlans.teamIdentifier,
    })
    .from(releasePlanDogs)
    .innerJoin(releasePlans, eq(releasePlanDogs.planId, releasePlans.id))
    .where(eq(releasePlanDogs.dogId, dogId));
  return rows;
}

/** Move a dog from its current plan(s) to a different plan */
export async function moveDogToPlan(
  dogId: string,
  targetPlanId: number,
  staffId: string | null,
  staffName: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove from all current plans
  await db.delete(releasePlanDogs).where(eq(releasePlanDogs.dogId, dogId));
  // Add to target plan
  await db.insert(releasePlanDogs).values({
    planId: targetPlanId,
    dogId,
    sortOrder: 0,
    addedByStaffId: staffId,
    addedByStaffName: staffName,
  });
}

export async function getTeamDocxTemplateUrl(teamIdentifier: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ docxTemplateUrl: teamSettings.docxTemplateUrl })
    .from(teamSettings)
    .where(eq(teamSettings.teamIdentifier, teamIdentifier))
    .limit(1);
  return rows[0]?.docxTemplateUrl ?? null;
}

export async function saveTeamDocxTemplateUrl(teamIdentifier: string, url: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(teamSettings)
    .values({ teamIdentifier, docxTemplateUrl: url })
    .onDuplicateKeyUpdate({ set: { docxTemplateUrl: url } });
}
