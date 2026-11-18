import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { createAuth, getSessionUser } from "../src/auth.ts";
import {
  createDb,
  getProjectRole,
  hasRole,
  projectMembers,
  projects,
  runMigrations,
} from "../src/index.ts";

const URL =
  process.env.TEST_DATABASE_URL ?? "postgres://backslash:backslash@127.0.0.1:5432/backslash_test";
const { db, pool } = createDb(URL);
const auth = createAuth({
  db,
  secret: "test-secret-test-secret-test-secret",
  baseURL: "http://localhost:5173",
  trustedOrigins: [],
});

beforeAll(async () => {
  await Promise.all([runMigrations(pool), runMigrations(pool)]);
});

afterAll(() => pool.end());

test("sign up, session from cookie, project role", async () => {
  const email = `u${Date.now()}@example.com`;
  const res = await auth.api.signUpEmail({
    body: { email, password: "correct horse battery", name: "Ada" },
    asResponse: true,
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;

  const user = await getSessionUser(auth, new Headers({ cookie }));
  expect(user?.email).toBe(email);
  expect(await getSessionUser(auth, new Headers({ cookie: "x=y" }))).toBeNull();

  const id = `p${Date.now()}`;
  await db.insert(projects).values({ id, name: "Thesis", ownerId: user!.id });
  expect(await getProjectRole(db, id, user!.id)).toBeNull();
  await db.insert(projectMembers).values({ projectId: id, userId: user!.id, role: "editor" });
  expect(await getProjectRole(db, id, user!.id)).toBe("editor");
  expect(hasRole("editor", "viewer")).toBe(true);
  expect(hasRole("editor", "owner")).toBe(false);
  expect(hasRole(null, "viewer")).toBe(false);
  await db.delete(projects).where(eq(projects.id, id));
});

test("rejects wrong password", async () => {
  const email = `w${Date.now()}@example.com`;
  await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: "B" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "wrong password!!" },
    asResponse: true,
  });
  expect(res.status).toBe(401);
});
