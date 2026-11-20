import * as z from "zod";

/** Valkey pub/sub channel: API tells collab to drop connections of a project (access changed). */
const COLLAB_REVOKE_CHANNEL = "collab:revoke";

const ProjectRole = z.enum(["owner", "editor", "viewer"]);
/** roles that can be granted (there is exactly one owner) */
const GrantableRole = z.enum(["editor", "viewer"]);

const ProjectName = z.string().trim().min(1).max(100);

const CreateProject = z.object({ name: ProjectName });
const UpdateProject = z.object({ name: ProjectName });
const UpdateMember = z.object({ role: GrantableRole });
const CreateInvite = z.object({ role: GrantableRole });

/* Responses */

const ErrorResponse = z.object({ error: z.string() });

const ProjectSummary = z.object({
  id: z.string(),
  name: z.string(),
  role: ProjectRole,
  ownerName: z.string(),
  updatedAt: z.string(),
});

const CreatedProject = z.object({ id: z.string() });

const ProjectMember = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: ProjectRole,
});

const ProjectInvite = z.object({ id: z.string(), role: GrantableRole, expiresAt: z.string() });

/** the token is only returned once, when created */
const CreatedInvite = ProjectInvite.extend({ token: z.string() });

const InvitePreview = z.object({
  projectId: z.string(),
  projectName: z.string(),
  role: GrantableRole,
});

const AcceptedInvite = z.object({ projectId: z.string() });

const ServerConfig = z.object({ github: z.boolean(), passwordReset: z.boolean() });

const Usage = z.object({ used: z.number(), limit: z.number() });

/** quotas and rate limits of the signed-in user; `window` in seconds */
const AccountUsage = z.object({
  projects: Usage,
  storage: Usage,
  rateLimits: z.array(z.object({ name: z.string(), max: z.number(), window: z.number() })),
});

/** the compile that will include the caller's edits; its result appears in the doc */
const CompileStarted = z.object({ seq: z.number() });

/* Admin */

const UserRole = z.enum(["user", "admin"]);

/** null limits fall back to the server-wide defaults */
const UpdateAdminUser = z
  .object({
    role: UserRole,
    banned: z.boolean(),
    projectLimit: z.number().int().min(0).max(100_000).nullable(),
    storageLimitMb: z.number().int().min(0).max(10_000_000).nullable(),
  })
  .partial();

const AdminListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const CompileDay = z.object({
  /** UTC, YYYY-MM-DD */
  date: z.string(),
  success: z.number(),
  error: z.number(),
  timeout: z.number(),
  failed: z.number(),
});

const AdminStats = z.object({
  users: z.object({
    total: z.number(),
    new7d: z.number(),
    new30d: z.number(),
    active7d: z.number(),
    banned: z.number(),
  }),
  projects: z.object({ total: z.number(), new30d: z.number() }),
  storageBytes: z.number(),
  /** last 30 days, oldest first */
  compiles: z.array(CompileDay),
  compileAvgMs: z.number().nullable(),
});

const AdminUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRole,
  banned: z.boolean(),
  createdAt: z.string(),
  lastActiveAt: z.string().nullable(),
  projects: z.number(),
  storageBytes: z.number(),
  compiles30d: z.number(),
  projectLimit: z.number().nullable(),
  storageLimitMb: z.number().nullable(),
});

const AdminUserPage = z.object({
  users: z.array(AdminUser),
  total: z.number(),
  pageSize: z.number(),
  defaults: z.object({ projectLimit: z.number(), storageLimitMb: z.number() }),
});

/** metadata only: names and content of projects stay private */
const AdminProject = z.object({
  id: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  members: z.number(),
  uploads: z.number(),
  uploadBytes: z.number(),
  docBytes: z.number(),
  compiles30d: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AdminProjectPage = z.object({
  projects: z.array(AdminProject),
  total: z.number(),
  pageSize: z.number(),
});

type ProjectRole = z.infer<typeof ProjectRole>;
type GrantableRole = z.infer<typeof GrantableRole>;
type ErrorResponse = z.infer<typeof ErrorResponse>;
type ProjectSummary = z.infer<typeof ProjectSummary>;
type CreatedProject = z.infer<typeof CreatedProject>;
type ProjectMember = z.infer<typeof ProjectMember>;
type ProjectInvite = z.infer<typeof ProjectInvite>;
type CreatedInvite = z.infer<typeof CreatedInvite>;
type InvitePreview = z.infer<typeof InvitePreview>;
type AcceptedInvite = z.infer<typeof AcceptedInvite>;
type ServerConfig = z.infer<typeof ServerConfig>;
type AccountUsage = z.infer<typeof AccountUsage>;
type CompileStarted = z.infer<typeof CompileStarted>;
type UserRole = z.infer<typeof UserRole>;
type UpdateAdminUser = z.infer<typeof UpdateAdminUser>;
type CompileDay = z.infer<typeof CompileDay>;
type AdminStats = z.infer<typeof AdminStats>;
type AdminUser = z.infer<typeof AdminUser>;
type AdminUserPage = z.infer<typeof AdminUserPage>;
type AdminProject = z.infer<typeof AdminProject>;
type AdminProjectPage = z.infer<typeof AdminProjectPage>;

export {
  AcceptedInvite,
  AccountUsage,
  AdminListQuery,
  AdminProject,
  AdminProjectPage,
  AdminStats,
  AdminUser,
  AdminUserPage,
  CompileDay,
  COLLAB_REVOKE_CHANNEL,
  CompileStarted,
  CreatedInvite,
  CreatedProject,
  CreateInvite,
  CreateProject,
  ErrorResponse,
  GrantableRole,
  InvitePreview,
  ProjectInvite,
  ProjectMember,
  ProjectName,
  ProjectRole,
  ProjectSummary,
  ServerConfig,
  UpdateAdminUser,
  UpdateMember,
  UpdateProject,
  UserRole,
};
