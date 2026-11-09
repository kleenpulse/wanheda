"use client";

import * as React from "react";
import { Tile } from "@/components/income/parts";
import { ChartCard, ChartTable } from "@/components/money/charts/chart-kit";
import { Tip } from "@/components/ui/tooltip";
import type { DayCount } from "@/lib/admin/series";
import type { AdminStats } from "@/lib/admin/stats";
import { cn } from "@/lib/utils";

// The admin page's body (ADR-0015): headline counts, two 30-day series, how
// many users each app has, and the newest sign-ups. Each chart has its table
// twin one press away (chart-kit); every number is tabular.

const NUM = new Intl.NumberFormat("en-GB");
const PCT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const dayLabel = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`));
const dateLabel = (iso: string) => DATE.format(new Date(iso));

function Num({ value }: { value: number }) {
  return <span className="tabular">{NUM.format(value)}</span>;
}

export function AdminDashboard({ stats }: { stats: AdminStats }) {
  const total = stats.users;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-2.5 @3xl/main:grid-cols-4 @3xl/main:gap-4">
        <Tile label="Users" note={<><Num value={stats.newWeek} /> new this week, <Num value={stats.newMonth} /> in 30 days</>}>
          <Num value={total} />
        </Tile>
        <Tile label="Active today" note="Used Wanheda today (UTC)">
          <Num value={stats.activeToday} />
        </Tile>
        <Tile label="Active this week" note={<>Last 7 days · <Num value={stats.activeMonth} /> in 30 days</>}>
          <Num value={stats.activeWeek} />
        </Tile>
        <Tile label="Signed-in devices" note="Sessions not yet expired">
          <Num value={stats.liveSessions} />
        </Tile>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-2">
        <DayBars title="Sign-ups" note="New accounts per day, last 30 days" unit="sign-ups" series={stats.signups} />
        <DayBars title="Active users" note="People who used Wanheda each day, last 30 days" unit="active" series={stats.active} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <AppUsage apps={stats.apps} total={total} />
        <RecentUsers users={stats.recent} />
      </div>
    </div>
  );
}

function DayBars({ title, note, unit, series }: { title: string; note: string; unit: string; series: readonly DayCount[] }) {
  const peak = Math.max(0, ...series.map((d) => d.count));
  const scale = Math.max(1, peak);
  const first = series[0];
  const last = series.at(-1);
  return (
    <ChartCard
      title={title}
      note={note}
      table={
        <ChartTable
          caption={`${title} per day`}
          head={["Day", unit]}
          rows={[...series].reverse().map((d) => ({ key: d.day, cells: [dayLabel(d.day), <Num key="n" value={d.count} />] }))}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex h-[150px] items-end gap-[3px]">
          {series.map((d) => (
            <Tip
              key={d.day}
              label={
                <span className="tabular">
                  {dayLabel(d.day)}: {NUM.format(d.count)} {unit}
                </span>
              }
              render={
                <span className="flex h-full min-w-0 flex-1 items-end rounded-t-[4px] hover:bg-card-nested">
                  <span
                    className={cn("w-full rounded-t-[4px]", d.count > 0 ? "bg-signal" : "bg-card-nested")}
                    style={{ height: d.count > 0 ? `${Math.max(4, (d.count / scale) * 100)}%` : "2px" }}
                  />
                </span>
              }
            />
          ))}
        </div>
        <div className="flex justify-between text-[11.5px] text-ink-3">
          <span className="tabular">{first ? dayLabel(first.day) : ""}</span>
          <span className="tabular">Peak {NUM.format(peak)}</span>
          <span className="tabular">{last ? dayLabel(last.day) : ""}</span>
        </div>
      </div>
    </ChartCard>
  );
}

function AppUsage({ apps, total }: { apps: AdminStats["apps"]; total: number }) {
  const sorted = [...apps].sort((a, b) => b.users - a.users);
  return (
    <ChartCard
      title="Apps in use"
      note="Users with at least one item in each app"
      table={
        <ChartTable
          caption="Users per app"
          head={["App", "Users", "Share"]}
          rows={sorted.map((a) => ({ key: a.id, cells: [a.title, <Num key="n" value={a.users} />, <span key="p" className="tabular">{total ? PCT.format(a.users / total) : "—"}</span>] }))}
        />
      }
    >
      <ul className="flex flex-col gap-3">
        {sorted.map((a) => {
          const share = total ? a.users / total : 0;
          return (
            <li key={a.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="text-foreground">{a.title}</span>
                <span className="text-ink-2">
                  <Num value={a.users} /> <span className="tabular text-ink-3">· {total ? PCT.format(share) : "—"}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-card-nested">
                <div className="h-full rounded-full bg-signal" style={{ width: `${String(share * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function RecentUsers({ users }: { users: AdminStats["recent"] }) {
  return (
    <section aria-label="Newest users" className="bento flex min-w-0 flex-col gap-3 p-5">
      <header>
        <h3 className="readout">Newest users</h3>
        <p className="mt-1 text-[12.5px] text-ink-2">The latest {users.length === 1 ? "sign-up" : `${String(users.length)} sign-ups`}, newest first</p>
      </header>
      {users.length === 0 ? (
        <p className="text-[13.5px] text-ink-2">Nobody has signed up yet.</p>
      ) : (
        <div className="-mx-2 overflow-x-auto overscroll-x-contain scroll-fade-x px-2">
          <table className="w-full min-w-[30rem] border-collapse text-[13px]">
            <caption className="sr-only">Newest users</caption>
            <thead>
              <tr className="text-left text-[11.5px] text-ink-3">
                <th scope="col" className="pb-2 font-medium">Name</th>
                <th scope="col" className="pb-2 font-medium">Email</th>
                <th scope="col" className="pb-2 font-medium">Joined</th>
                <th scope="col" className="pb-2 text-right font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="odd:bg-card-nested/60 [&>td:first-child]:rounded-l-[10px] [&>td:last-child]:rounded-r-[10px]">
                  <td className="max-w-[12rem] truncate px-2 py-2 text-foreground">{u.name || "—"}</td>
                  <td className="max-w-[16rem] truncate px-2 py-2 font-mono text-[12.5px] text-ink-2">{u.email}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-ink-2">
                    <span className="tabular">{dateLabel(u.joinedAt)}</span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-ink-2">
                    {u.lastActive ? <span className="tabular">{dateLabel(`${u.lastActive}T00:00:00Z`)}</span> : <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
