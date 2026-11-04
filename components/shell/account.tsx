"use client";

import * as React from "react";
import type { ShellAccount } from "@/lib/shell/account";

const AccountContext = React.createContext<ShellAccount | null>(null);

/** The owner (or the demo), handed down once from the shell layout. */
export function AccountProvider({ account, children }: { account: ShellAccount; children: React.ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): ShellAccount {
  const account = React.useContext(AccountContext);
  if (!account) throw new Error("useAccount() outside the shell");
  return account;
}
