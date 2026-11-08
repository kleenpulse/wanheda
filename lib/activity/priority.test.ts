import { describe, expect, it } from "vitest";
import { rankActivities, type Ranked } from "./priority";

const a = (item: string, kind: Ranked<string>["kind"], startedAt = 0): Ranked<string> => ({ item, kind, startedAt });

describe("island priority (V61)", () => {
  it("media and speech lead, then timers, transfers, sync, alerts", () => {
    const out = rankActivities([a("alert", "alert"), a("scan", "transfer"), a("t1", "timer", 50), a("sync", "sync"), a("music", "media", 10)]);
    expect(out.map((x) => x.item)).toEqual(["music", "t1", "scan", "sync", "alert"]);
  });

  it("within a rank the newest started leads", () => {
    const out = rankActivities([a("speech", "speech", 100), a("music", "media", 200)]);
    expect(out.map((x) => x.item)).toEqual(["music", "speech"]);
    expect(rankActivities([a("speech", "speech", 300), a("music", "media", 200)])[0]?.item).toBe("speech");
  });

  it("a timer started while music plays doesn't take the lead", () => {
    const out = rankActivities([a("music", "media", 100), a("t1", "timer", 500)]);
    expect(out[0]?.item).toBe("music");
  });

  it("ties keep their given order", () => {
    const out = rankActivities([a("t-soon", "timer"), a("t-later", "timer"), a("dl", "transfer"), a("remux", "transfer")]);
    expect(out.map((x) => x.item)).toEqual(["t-soon", "t-later", "dl", "remux"]);
  });

  it("a hidden kind leaves; the rest keep their order (the now-playing bar holds the music, V66)", () => {
    const all = [a("music", "media", 500), a("speech", "speech", 100), a("t1", "timer", 900), a("alert", "alert")];
    expect(rankActivities(all, ["media"]).map((x) => x.item)).toEqual(["speech", "t1", "alert"]);
    expect(rankActivities([a("music", "media", 500), a("t1", "timer", 900)], ["media"])[0]?.item).toBe("t1");
    expect(rankActivities(all, []).map((x) => x.item)).toEqual(["music", "speech", "t1", "alert"]);
  });
});
