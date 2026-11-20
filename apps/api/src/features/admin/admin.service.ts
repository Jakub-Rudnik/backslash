import type {
  AdminProject,
  AdminStats,
  AdminUser,
  CompileDay,
  UpdateAdminUser,
} from "@backslash/shared";
import {
  collabDocuments,
  compiles,
  projectBlobs,
  projectMembers,
  projects,
  session,
  user,
  type Db,
  type Executor,
} from "@backslash/db";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  max,
  or,
  sql,
  sum,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export const PAGE_SIZE = 50;
const STATS_DAYS = 30;
const DAY_MS = 24 * 3600_000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

const countWhere = (condition: SQL | undefined) =>
  sql`count(*) filter (where ${condition})`.mapWith(Number);

function startOfStats() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() - (STATS_DAYS - 1) * DAY_MS);
}

export async function adminStats(db: Db): Promise<AdminStats> {
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);
  const since = startOfStats();
  const blobs = db
    .selectDistinct({ hash: projectBlobs.hash, size: projectBlobs.size })
    .from(projectBlobs)
    .as("blobs");
  const day = sql<string>`to_char(${compiles.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [[users], [active], [projectCounts], [storage], compileRows, [duration]] =
    await Promise.all([
      db
        .select({
          total: count(),
          new7d: countWhere(gt(user.createdAt, weekAgo)),
          new30d: countWhere(gt(user.createdAt, monthAgo)),
          banned: countWhere(eq(user.banned, true)),
        })
        .from(user),
      db
        .select({ count: countDistinct(session.userId) })
        .from(session)
        .where(gt(session.updatedAt, weekAgo)),
      db
        .select({ total: count(), new30d: countWhere(gt(projects.createdAt, monthAgo)) })
        .from(projects),
      db.select({ bytes: sql`coalesce(sum(${blobs.size}), 0)`.mapWith(Number) }).from(blobs),
      db
        .select({ date: day, outcome: compiles.outcome, count: count() })
        .from(compiles)
        .where(gte(compiles.createdAt, since))
        .groupBy(day, compiles.outcome),
      db
        .select({ avg: sql<string | null>`avg(${compiles.durationMs})` })
        .from(compiles)
        .where(
          and(gte(compiles.createdAt, since), inArray(compiles.outcome, ["success", "error"])),
        ),
    ]);

  const days = Array.from({ length: STATS_DAYS }, (_, i): CompileDay => ({
    date: new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    success: 0,
    error: 0,
    timeout: 0,
    failed: 0,
  }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const row of compileRows) {
    const entry = byDate.get(row.date);
    if (entry) entry[row.outcome] += row.count;
  }

  return {
    users: {
      total: users?.total ?? 0,
      new7d: users?.new7d ?? 0,
      new30d: users?.new30d ?? 0,
      active7d: active?.count ?? 0,
      banned: users?.banned ?? 0,
    },
    projects: { total: projectCounts?.total ?? 0, new30d: projectCounts?.new30d ?? 0 },
    storageBytes: storage?.bytes ?? 0,
    compiles: days,
    compileAvgMs: duration?.avg == null ? null : Math.round(Number(duration.avg)),
  };
}

export async function listUsers(db: Db, query: { q?: string | undefined; page: number }) {
  const monthAgo = daysAgo(30);
  const search = query.q
    ? or(ilike(user.email, `%${query.q}%`), ilike(user.name, `%${query.q}%`))
    : undefined;

  const lastSeen = db
    .select({ userId: session.userId, at: max(session.updatedAt).as("last_seen_at") })
    .from(session)
    .groupBy(session.userId)
    .as("last_seen");
  const owned = db
    .select({ ownerId: projects.ownerId, count: count().as("owned_count") })
    .from(projects)
    .groupBy(projects.ownerId)
    .as("owned");
  const ownedBlobs = db
    .selectDistinct({
      ownerId: projects.ownerId,
      hash: projectBlobs.hash,
      size: projectBlobs.size,
    })
    .from(projectBlobs)
    .innerJoin(projects, eq(projects.id, projectBlobs.projectId))
    .as("owned_blobs");
  const storage = db
    .select({ ownerId: ownedBlobs.ownerId, bytes: sum(ownedBlobs.size).as("storage_bytes") })
    .from(ownedBlobs)
    .groupBy(ownedBlobs.ownerId)
    .as("storage");
  const recent = db
    .select({ userId: compiles.userId, count: count().as("recent_count") })
    .from(compiles)
    .where(gt(compiles.createdAt, monthAgo))
    .groupBy(compiles.userId)
    .as("recent");

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
        projectLimit: user.projectLimit,
        storageLimitMb: user.storageLimitMb,
        lastActiveAt: lastSeen.at,
        projects: sql`coalesce(${owned.count}, 0)`.mapWith(Number),
        storageBytes: sql`coalesce(${storage.bytes}, 0)`.mapWith(Number),
        compiles30d: sql`coalesce(${recent.count}, 0)`.mapWith(Number),
      })
      .from(user)
      .leftJoin(lastSeen, eq(lastSeen.userId, user.id))
      .leftJoin(owned, eq(owned.ownerId, user.id))
      .leftJoin(storage, eq(storage.ownerId, user.id))
      .leftJoin(recent, eq(recent.userId, user.id))
      .where(search)
      .orderBy(desc(user.createdAt), user.id)
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(user).where(search),
  ]);

  return {
    users: rows.map((r): AdminUser => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
    })),
    total: total?.count ?? 0,
  };
}

/** Metadata only; project names and content stay private. */
export async function listProjects(db: Db, query: { q?: string | undefined; page: number }) {
  const monthAgo = daysAgo(30);
  const search = query.q
    ? or(eq(projects.id, query.q), ilike(user.email, `%${query.q}%`))
    : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: projects.id,
        ownerName: user.name,
        ownerEmail: user.email,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        members:
          sql`(select count(*) from ${projectMembers} where ${projectMembers.projectId} = ${projects.id})`.mapWith(
            Number,
          ),
        uploads:
          sql`(select count(*) from ${projectBlobs} where ${projectBlobs.projectId} = ${projects.id})`.mapWith(
            Number,
          ),
        uploadBytes:
          sql`(select coalesce(sum(${projectBlobs.size}), 0) from ${projectBlobs} where ${projectBlobs.projectId} = ${projects.id})`.mapWith(
            Number,
          ),
        docBytes: sql`coalesce(octet_length(${collabDocuments.data}), 0)`.mapWith(Number),
        compiles30d:
          sql`(select count(*) from ${compiles} where ${compiles.projectId} = ${projects.id} and ${compiles.createdAt} > ${monthAgo})`.mapWith(
            Number,
          ),
      })
      .from(projects)
      .innerJoin(user, eq(user.id, projects.ownerId))
      .leftJoin(collabDocuments, eq(collabDocuments.projectId, projects.id))
      .where(search)
      .orderBy(desc(projects.updatedAt), projects.id)
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
    db
      .select({ count: count() })
      .from(projects)
      .innerJoin(user, eq(user.id, projects.ownerId))
      .where(search),
  ]);

  return {
    projects: rows.map((r): AdminProject => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: total?.count ?? 0,
  };
}

/** Projects the user belongs to, owned ones included. */
async function projectsOf(db: Executor, userId: string) {
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}

/**
 * Applies an admin's changes; banning also ends the user's sessions. Returns the projects whose
 * open connections must be re-checked, or null when the user doesn't exist.
 */
export async function updateUser(db: Db, userId: string, changes: UpdateAdminUser) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (updated.length === 0) return null;
    if (!changes.banned) return [];
    await tx.delete(session).where(eq(session.userId, userId));
    return projectsOf(tx, userId);
  });
}

export async function endSessions(db: Db, userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
}

/**
 * Deletes the user with everything they own (projects, their files and docs go by cascade).
 * Returns the projects they belonged to, or null when the user doesn't exist.
 */
export async function deleteUser(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    const memberOf = await projectsOf(tx, userId);
    const deleted = await tx.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
    return deleted.length === 0 ? null : memberOf;
  });
}
