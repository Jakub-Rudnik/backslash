import type { CompileRequest, CompileResult } from "@backslash/shared";

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
      // zod flattenError: { formErrors: string[], fieldErrors: Record<string, string[]> }
      const flat = body.error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
      const messages = [flat.formErrors, ...Object.values(flat.fieldErrors ?? {})]
        .flatMap((m) => (Array.isArray(m) ? m : []))
        .filter((m): m is string => typeof m === "string");
      if (messages.length > 0) return messages.join(", ");
    }
  } catch {
    // non-JSON body
  }
  return `Request failed (${res.status})`;
}

export async function compile(request: CompileRequest): Promise<CompileResponse> {
  const res = await fetch(`${API_BASE}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<CompileResponse>;
}

export function pdfUrl(jobId: string) {
  return `${API_BASE}/compile/${jobId}/pdf`;
}
