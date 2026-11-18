import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const projectRole = pgEnum("project_role", ["owner", "editor", "viewer"]);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    compileSeq: integer("compile_seq").notNull().default(0),
  },
  (t) => [index("projects_owner_id_idx").on(t.ownerId)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_id_idx").on(t.userId),
  ],
);

/** Share links. Only the sha256 of the token is stored. */
export const projectInvites = pgTable(
  "project_invites",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    role: projectRole("role").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("project_invites_project_id_idx").on(t.projectId)],
);

/** Which uploaded blobs a project may use; a hash alone grants nothing. */
export const projectBlobs = pgTable(
  "project_blobs",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.hash] }),
    index("project_blobs_hash_idx").on(t.hash),
  ],
);

/** Yjs state of each project, written by the collab server. */
export const collabDocuments = pgTable("collab_documents", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
