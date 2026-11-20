import { DashboardSquare01Icon, Logout01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AccountDialog } from "@/features/account/account-dialog";
import { useAccount } from "@/features/auth/account";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/features/auth/auth-client";
import { identityFor, initials } from "@/lib/user";

export function UserMenu() {
  const account = useAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { color } = identityFor(account);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function signOut() {
    const { error } = await authClient.signOut();
    if (error) {
      window.alert(`Couldn't sign out: ${error.message ?? "unknown error"}`);
      return;
    }
    queryClient.clear();
    void navigate("/login");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[11px] font-semibold text-black outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          style={{ backgroundColor: color }}
        >
          {initials(account.name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="truncate font-medium text-foreground">{account.name}</div>
              <div className="truncate">{account.email}</div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <HugeiconsIcon icon={Settings02Icon} />
            Settings
          </DropdownMenuItem>
          {account.role === "admin" && (
            <DropdownMenuItem onClick={() => void navigate("/admin")}>
              <HugeiconsIcon icon={DashboardSquare01Icon} />
              Admin panel
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void signOut()}>
            <HugeiconsIcon icon={Logout01Icon} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AccountDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
