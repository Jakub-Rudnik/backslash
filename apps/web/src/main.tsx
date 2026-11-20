import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "./index.css";
import { FullPageMessage, RequireAuth } from "./features/auth/require-auth.tsx";
import { DashboardPage } from "./pages/dashboard-page.tsx";
import { ForgotPasswordPage } from "./pages/forgot-password-page.tsx";
import { InvitePage } from "./pages/invite-page.tsx";
import { LoginPage } from "./pages/login-page.tsx";
import { ProjectPage } from "./pages/project-page.tsx";
import { ResetPasswordPage } from "./pages/reset-password-page.tsx";
import { queryClient } from "./lib/query-client.ts";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage mode="sign-in" /> },
  { path: "/signup", element: <LoginPage mode="sign-up" /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    ),
  },
  {
    path: "/p/:projectId",
    element: (
      <RequireAuth>
        <ProjectPage />
      </RequireAuth>
    ),
  },
  {
    path: "/admin",
    hydrateFallbackElement: <FullPageMessage>Loading…</FullPageMessage>,
    lazy: async () => {
      const { AdminPage } = await import("./pages/admin-page.tsx");
      return {
        element: (
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        ),
      };
    },
  },
  {
    path: "/invite/:token",
    element: (
      <RequireAuth>
        <InvitePage />
      </RequireAuth>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
