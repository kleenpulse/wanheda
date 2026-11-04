import { PAGE_COLUMN } from "@/components/shell/page-frame";
import { cn } from "@/lib/utils";

// Every shell page reads the request (requireOwner → connection()), so each
// needs its own Suspense boundary for client navigations to be instant: the
// rail stays put and this page-shaped skeleton shows until the page streams.
export default function ShellPageLoading() {
  return (
    <div className="flex min-h-svh flex-col" aria-busy>
      <div className={cn(PAGE_COLUMN, "pt-6 pb-6")}>
        <div className="h-[27px] w-32 rounded-pill bg-card-nested" />
        <div className="mt-2 h-3.5 w-48 rounded-pill bg-card-nested opacity-70" />
      </div>
      <div className="flex-1 rounded-t-frame bg-sheet dark:border-t dark:border-glass-border" />
    </div>
  );
}
