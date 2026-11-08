import { PAGE_COLUMN, PAGE_ROOT, PAGE_SHEET } from "@/components/shell/page-frame";
import { cn } from "@/lib/utils";

// Every shell page reads the request (requireOwner → connection()), so each
// needs its own Suspense boundary for client navigations to be instant: the
// rail stays put and this page-shaped skeleton shows until the page streams.
// It wears PageFrame's root and sheet, so a whole-page wallpaper sits behind
// it exactly as it will behind the page (SPEC V64).
export default function ShellPageLoading() {
  return (
    <div className={PAGE_ROOT} aria-busy>
      <div className={cn(PAGE_COLUMN, "pt-6 pb-6")}>
        <div className="h-[27px] w-32 rounded-pill bg-card-nested" />
        <div className="mt-2 h-3.5 w-48 rounded-pill bg-card-nested opacity-70" />
      </div>
      <div data-sheet className={PAGE_SHEET} />
    </div>
  );
}
