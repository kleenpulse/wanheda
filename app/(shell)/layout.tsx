import { Suspense } from "react";
import { requireOwner } from "@/lib/auth/owner";

// Every page in the shell is behind requireOwner(). It reads the request, so
// it sits inside Suspense (Cache Components, SPEC V16).
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <OwnerGate>{children}</OwnerGate>
    </Suspense>
  );
}

async function OwnerGate({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return children;
}

function ShellFallback() {
  return (
    <main className="flex flex-1 items-center justify-center p-6" aria-busy>
      <div className="bento w-full max-w-md p-8">
        <div className="h-3 w-32 rounded-pill bg-card-nested" />
        <div className="mt-4 h-10 w-48 rounded-pill bg-card-nested opacity-70" />
        <div className="mt-5 h-4 w-full rounded-pill bg-card-nested opacity-50" />
      </div>
    </main>
  );
}
