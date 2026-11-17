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

type ProjectRole = z.infer<typeof ProjectRole>;
type GrantableRole = z.infer<typeof GrantableRole>;

type ProjectSummary = {
  id: string;
  name: string;
  role: ProjectRole;
  ownerName: string;
  updatedAt: string;
};

type ProjectMember = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: ProjectRole;
};

type ProjectInvite = { id: string; role: GrantableRole; expiresAt: string };

/** the token is only returned once, when created */
type CreatedInvite = ProjectInvite & { token: string };

type InvitePreview = { projectId: string; projectName: string; role: GrantableRole };

type ServerConfig = { github: boolean };

export {
  COLLAB_REVOKE_CHANNEL,
  CreateInvite,
  CreateProject,
  GrantableRole,
  ProjectName,
  ProjectRole,
  UpdateMember,
  UpdateProject,
};
export type {
  CreatedInvite,
  InvitePreview,
  ProjectInvite,
  ProjectMember,
  ProjectSummary,
  ServerConfig,
};
