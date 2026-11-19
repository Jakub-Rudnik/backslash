import {
  AcceptedInvite,
  AccountUsage,
  CompileStarted,
  CreatedInvite,
  CreatedProject,
  ErrorResponse,
  InvitePreview,
  ProjectInvite,
  ProjectMember,
  ProjectSummary,
  ServerConfig,
  UploadedBlob,
  type GrantableRole,
} from "@backslash/shared";
import * as z from "zod";

const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function errorMessage(res: Response) {
  const body = ErrorResponse.safeParse(await res.json().catch(() => null));
  return body.success ? body.data.error : `Request failed (${res.status})`;
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res;
}

async function call<T>(schema: z.ZodType<T>, method: string, path: string, body?: unknown) {
  const res = await send(method, path, body);
  return schema.parse(await res.json());
}

const project = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const api = {
  config: () => call(ServerConfig, "GET", "/config"),
  usage: () => call(AccountUsage, "GET", "/account/usage"),

  projects: () => call(z.array(ProjectSummary), "GET", "/projects"),
  project: (id: string) => call(ProjectSummary, "GET", project(id)),
  createProject: (name: string) => call(CreatedProject, "POST", "/projects", { name }),
  renameProject: async (id: string, name: string) => {
    await send("PATCH", project(id), { name });
  },
  deleteProject: async (id: string) => {
    await send("DELETE", project(id));
  },

  members: (id: string) => call(z.array(ProjectMember), "GET", `${project(id)}/members`),
  setMemberRole: async (id: string, userId: string, role: GrantableRole) => {
    await send("PATCH", `${project(id)}/members/${encodeURIComponent(userId)}`, { role });
  },
  removeMember: async (id: string, userId: string) => {
    await send("DELETE", `${project(id)}/members/${encodeURIComponent(userId)}`);
  },

  invites: (id: string) => call(z.array(ProjectInvite), "GET", `${project(id)}/invites`),
  createInvite: (id: string, role: GrantableRole) =>
    call(CreatedInvite, "POST", `${project(id)}/invites`, { role }),
  revokeInvite: async (id: string, inviteId: string) => {
    await send("DELETE", `${project(id)}/invites/${encodeURIComponent(inviteId)}`);
  },
  invite: (token: string) => call(InvitePreview, "GET", `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    call(AcceptedInvite, "POST", `/invites/${encodeURIComponent(token)}/accept`),

  /** the server compiles its own copy of the project; the result appears in the doc */
  compile: (id: string) => call(CompileStarted, "POST", `${project(id)}/compile`),
};

export function pdfUrl(projectId: string, jobId: string) {
  return `${API_BASE}${project(projectId)}/compile/${jobId}/pdf`;
}

export async function uploadBlob(projectId: string, data: Blob): Promise<UploadedBlob> {
  const res = await fetch(`${API_BASE}${project(projectId)}/blobs`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return UploadedBlob.parse(await res.json());
}

/** Served as an attachment; use fetchBlob() to display it. */
export function blobUrl(projectId: string, hash: string) {
  return `${API_BASE}${project(projectId)}/blobs/${hash}`;
}

export async function fetchBlob(projectId: string, hash: string, type = ""): Promise<Blob> {
  const res = await fetch(blobUrl(projectId, hash));
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return new Blob([await res.arrayBuffer()], { type });
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}
