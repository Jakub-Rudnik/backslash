import {
  UploadedBlob,
  type CompileResult,
  type CreatedInvite,
  type GrantableRole,
  type InvitePreview,
  type ProjectInvite,
  type ProjectMember,
  type ProjectSummary,
  type ServerConfig,
} from "@backslash/shared";

const API_BASE = "/api";

export type CompileResponse = CompileResult & { jobId: string };

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function errorMessage(res: Response) {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      if (typeof body.error === "string") return body.error;
      const flat = body.error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
      const messages = [flat.formErrors, ...Object.values(flat.fieldErrors ?? {})]
        .flatMap((m) => (Array.isArray(m) ? m : []))
        .filter((m): m is string => typeof m === "string");
      if (messages.length > 0) return messages.join(", ");
    }
  } catch {}
  return `Request failed (${res.status})`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

const project = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const api = {
  config: () => call<ServerConfig>("GET", "/config"),

  projects: () => call<ProjectSummary[]>("GET", "/projects"),
  project: (id: string) => call<ProjectSummary>("GET", project(id)),
  createProject: (name: string) => call<{ id: string }>("POST", "/projects", { name }),
  renameProject: (id: string, name: string) => call<void>("PATCH", project(id), { name }),
  deleteProject: (id: string) => call<void>("DELETE", project(id)),

  members: (id: string) => call<ProjectMember[]>("GET", `${project(id)}/members`),
  setMemberRole: (id: string, userId: string, role: GrantableRole) =>
    call<void>("PATCH", `${project(id)}/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (id: string, userId: string) =>
    call<void>("DELETE", `${project(id)}/members/${encodeURIComponent(userId)}`),

  invites: (id: string) => call<ProjectInvite[]>("GET", `${project(id)}/invites`),
  createInvite: (id: string, role: GrantableRole) =>
    call<CreatedInvite>("POST", `${project(id)}/invites`, { role }),
  revokeInvite: (id: string, inviteId: string) =>
    call<void>("DELETE", `${project(id)}/invites/${encodeURIComponent(inviteId)}`),
  invite: (token: string) => call<InvitePreview>("GET", `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    call<{ projectId: string }>("POST", `/invites/${encodeURIComponent(token)}/accept`),

  /** the server compiles its own copy of the project, nothing is sent */
  compile: (id: string) => call<CompileResponse>("POST", `${project(id)}/compile`),
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
