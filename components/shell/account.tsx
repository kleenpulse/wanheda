"use client";

import * as React from "react";
import { watchAccount } from "@/lib/device/account-channel";
import { scopeFor, setDeviceScope } from "@/lib/device/scope";
import type { ShellAccount } from "@/lib/shell/account";

const AccountContext = React.createContext<ShellAccount | null>(null);

/**
 * The signed-in user (or the demo), handed down once from the shell layout.
 * It also names this tab's device stores after the account (ADR-0015): set
 * during render, because children's effects (which open the stores) run
 * before this component's own. Idempotent, so a re-render is harmless.
 */
export function AccountProvider({ account, children }: { account: ShellAccount; children: React.ReactNode }) {
  const scope = scopeFor(account);
  setDeviceScope(scope);
  React.useEffect(
    () =>
      watchAccount(scope.id, () => {
        window.location.reload();
      }),
    [scope.id],
  );
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): ShellAccount {
  const account = React.useContext(AccountContext);
  if (!account) throw new Error("useAccount() outside the shell");
  return account;
}
