import type { CompileResult } from "@backslash/shared";

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
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // non-JSON body
  }
  return `Request failed (${res.status})`;
}

export async function compile(source: string): Promise<CompileResponse> {
  const res = await fetch(`${API_BASE}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<CompileResponse>;
}

export function pdfUrl(jobId: string) {
  return `${API_BASE}/compile/${jobId}/pdf`;
}
