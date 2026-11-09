"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthWord } from "@/lib/auth/auth-word";

interface AuthWordValue {
  word: AuthWord;
  setWord: (word: AuthWord) => void;
}

const AuthWordContext = createContext<AuthWordValue | null>(null);

/** Carries the swarm's word from the sign-in panel to the swarm (V82). */
export function AuthWordProvider({ children }: { children: ReactNode }) {
  const [word, setWord] = useState<AuthWord>("wanheda");
  const value = useMemo(() => ({ word, setWord }), [word]);
  return <AuthWordContext value={value}>{children}</AuthWordContext>;
}

/** Null outside the provider: the panel then simply has no swarm to drive. */
export function useAuthWord(): AuthWordValue | null {
  return useContext(AuthWordContext);
}

// ogl and the shaders load after first paint, never in front of it. Nothing
// renders until the chunk arrives; the band is absolutely placed, so nothing
// shifts when it does.
const AuthSwarm = dynamic(() => import("@/components/auth/auth-swarm"), { ssr: false });

export function AuthSwarmSlot() {
  const word = useContext(AuthWordContext)?.word ?? "wanheda";
  return <AuthSwarm word={word} />;
}
