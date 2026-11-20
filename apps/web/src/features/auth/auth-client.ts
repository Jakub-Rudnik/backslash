import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields({ user: { role: { type: "string", input: false } } })],
});

export type Account = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
};
