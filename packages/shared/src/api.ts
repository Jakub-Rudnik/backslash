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

export {
  AcceptedInvite,
  AccountUsage,
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
  UpdateMember,
  UpdateProject,
};
