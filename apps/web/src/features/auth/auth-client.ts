import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth" });

export type Account = { id: string; name: string; email: string; image?: string | null };
