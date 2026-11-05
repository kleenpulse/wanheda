import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { DEFAULT_TIME_ZONE, todayIn } from "@/lib/money/dates";
import { EXPORT_FORMATS, exportFilename, toCsv, toJson, type ExportFormat, type MoneyExport } from "@/lib/money/export";
import { seedMoney } from "@/lib/money/seed";
import { loadExport } from "@/lib/money/store";

// Money export (FR-MONEY-18): `?format=csv` (the ledger) or `?format=json`
// (every table), as a download. requireOwner() first (SPEC V7). Demo exports
// its sample data, labelled as such in the file name.

const TYPES: Record<ExportFormat, string> = { csv: "text/csv; charset=utf-8", json: "application/json; charset=utf-8" };

function isFormat(v: string | null): v is ExportFormat {
  return v !== null && (EXPORT_FORMATS as readonly string[]).includes(v);
}

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  const format = request.nextUrl.searchParams.get("format");
  if (!isFormat(format)) return NextResponse.json({ error: "Bad format" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  let data: MoneyExport;
  let name: string;
  if (owner.kind === "demo") {
    const today = todayIn(DEFAULT_TIME_ZONE);
    const seed = seedMoney(today);
    data = {
      exportedAt: new Date().toISOString(),
      baseCurrency: seed.baseCurrency,
      timeZone: seed.timeZone,
      accounts: seed.accounts,
      categories: seed.categories,
      txns: seed.txns,
      subscriptions: seed.subscriptions ?? [],
      budgets: seed.budgets ?? [],
      rules: seed.rules ?? [],
    };
    name = exportFilename(format, today).replace("wanheda-money", "wanheda-money-demo");
  } else {
    const loaded = await loadExport(owner.user.id);
    if (!loaded) return NextResponse.json({ error: "Load failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const { settings, truncated, ...rest } = loaded;
    data = { exportedAt: new Date().toISOString(), baseCurrency: settings.baseCurrency, timeZone: settings.timeZone, ...rest };
    const today = todayIn(settings.timeZone);
    name = exportFilename(format, today);
    if (truncated) name = name.replace(`.${format}`, `-first-200000.${format}`);
  }

  const body = format === "csv" ? toCsv(data) : toJson(data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
