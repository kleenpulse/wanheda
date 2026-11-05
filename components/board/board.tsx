"use client";

import * as React from "react";
import { Check, GripVertical, LayoutGrid, Pencil, Plus, X } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import { getBreakpointFromWidth } from "react-grid-layout/core";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saveBoard } from "@/actions/board";
import { EDIT_PARAM } from "@/lib/board/edit";
import { useAccount } from "@/components/shell/account";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import {
  BOARD_KEY,
  BREAKPOINTS,
  BREAKPOINT_NAMES,
  COLS,
  GAP,
  ROW_HEIGHT,
  addWidget,
  nudge,
  removeWidget,
  seedLayouts,
  sizeLimits,
  widgetsOn,
  type BoardItem,
  type BoardLayouts,
  type BoardPayload,
  type BoardSource,
  type Breakpoint,
  type KeyAction,
} from "@/lib/board/layout";
import { fetchJson } from "@/lib/fetch-json";
import { WIDGETS, type WidgetId } from "@/lib/modules";
import { cn } from "@/lib/utils";

/*
  The home board (FR-SHELL-2). Widgets come from the module manifests and are
  rendered on the server (slots); this places them. Editing is a mode, so a
  stray touch never drags a widget and the note stays typeable. In edit mode
  each widget's grip moves it with the arrow keys and resizes it with
  Shift+arrows, since dragging has no keyboard path.

  The owner's layout is saved per breakpoint after each change. Demo boards
  are the seed and never saved (SPEC T25).

  The layouts live in the shell's QueryClient (BOARD_KEY), not in the page's
  server props: a hop back to Home paints the board from that cache at once
  (CLAUDE.md: native-app feel), and every change is written back to it.
*/

type SaveState = "idle" | "saving" | "saved" | "failed";

const KEYS: Record<string, KeyAction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
const KEY_SAVE_DELAY = 700;
const TITLES: ReadonlyMap<WidgetId, string> = new Map(WIDGETS.map((w) => [w.id, w.title]));

function pick(items: Layout): BoardItem[] {
  return items.map((l) => ({ i: l.i as WidgetId, x: l.x, y: l.y, w: l.w, h: l.h }));
}

function sameLayout(a: readonly BoardItem[], b: readonly BoardItem[]) {
  return a.length === b.length && a.every((item, n) => {
    const o = b[n];
    return o?.i === item.i && o.x === item.x && o.y === item.y && o.w === item.w && o.h === item.h;
  });
}

function withLimits(layouts: BoardLayouts): Record<Breakpoint, LayoutItem[]> {
  const out = {} as Record<Breakpoint, LayoutItem[]>;
  for (const bp of BREAKPOINT_NAMES) {
    out[bp] = layouts[bp].map((item) => {
      const { minW, maxW, minH, maxH } = sizeLimits(item.i, COLS[bp]);
      return { ...item, minW, maxW, minH, maxH };
    });
  }
  return out;
}

/** Saves through the server action. Patches merge, so a burst of key presses is one write. */
function useBoardSaver(persist: boolean) {
  const [state, setState] = React.useState<SaveState>("idle");
  const pending = React.useRef<Partial<BoardLayouts>>({});
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = React.useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setState("saving");
    try {
      const result = await saveBoard(patch);
      setState(result.ok ? "saved" : "failed");
    } catch {
      setState("failed");
    }
  }, []);

  const save = React.useCallback(
    (patch: Partial<BoardLayouts>, delay = 0) => {
      if (!persist) return;
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [persist, flush],
  );

  // Leaving Home inside the key-save pause still saves the last nudges.
  React.useEffect(() => () => void flush(), [flush]);
  return { state, save };
}

export function Board({ nodes }: { nodes: Record<WidgetId, React.ReactNode> }) {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => fetchJson<BoardPayload>("/api/board"),
    // Demo's board is the seed: nothing to pull, its edits live in this tab.
    staleTime: demo ? Infinity : 30_000,
  });
  // No cached board and the read failed: the seed stands in, never saved (SPEC V17).
  const payload: BoardPayload | null =
    query.data ?? (query.isError ? { source: "load-failed", layouts: seedLayouts() } : null);
  if (!payload) return <BoardSkeleton />;
  // A board that loads after a failed read starts over from the real layout.
  return <BoardGrid key={payload.source} initial={payload.layouts} source={payload.source} nodes={nodes} />;
}

/** First visit only, before the board is on the device. */
function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading the board">
      <div className="min-h-9 px-1" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-[176px] rounded-card bg-card-nested md:col-span-1" />
        <div className="h-[176px] rounded-card bg-card-nested md:col-span-1" />
        <div className="h-[176px] rounded-card bg-card-nested md:col-span-1" />
      </div>
    </div>
  );
}

function BoardGrid({
  initial,
  source,
  nodes,
}: {
  initial: BoardLayouts;
  source: BoardSource;
  nodes: Record<WidgetId, React.ReactNode>;
}) {
  const persist = source === "owner";
  const [layouts, setLayouts] = React.useState(initial);
  // Keep the cache in step, so the next visit paints this board, not the one loaded.
  const qc = useQueryClient();
  React.useEffect(() => {
    qc.setQueryData<BoardPayload>(BOARD_KEY, (prev) => (prev?.source === source ? { ...prev, layouts } : prev));
  }, [qc, layouts, source]);
  // Edit mode lives in the URL (`?edit=1`), not in state: Next keeps a route
  // you leave alive (hidden, state intact), so local state would still be
  // editing when you come back. A plain link to Home carries no flag, and the
  // palette's "Edit the board" opens /?edit=1 from anywhere.
  const editing = useSearchParams().get(EDIT_PARAM) === "1";
  const pathname = usePathname();
  const setEditing = (on: boolean) => {
    window.history.replaceState(null, "", on ? `${pathname}?${EDIT_PARAM}=1` : pathname);
  };
  const [announcement, setAnnouncement] = React.useState("");
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true, debounceTimeout: 50 });
  const bp = getBreakpointFromWidth<Breakpoint>(BREAKPOINTS, width);
  const { state: saveState, save } = useBoardSaver(persist);

  const onBoard = widgetsOn(layouts);
  const available = WIDGETS.filter((w) => !onBoard.includes(w.id));
  const gridLayouts = React.useMemo(() => withLimits(layouts), [layouts]);
  const toolbar = React.useRef<HTMLDivElement>(null);

  const commit = (next: BoardLayouts, patch: Partial<BoardLayouts>, delay = 0) => {
    setLayouts(next);
    save(patch, delay);
  };

  const add = (id: WidgetId) => {
    const next = addWidget(layouts, id);
    commit(next, next);
    setAnnouncement(`${TITLES.get(id) ?? id} added at the bottom of the board.`);
  };

  const remove = (id: WidgetId) => {
    const next = removeWidget(layouts, id);
    commit(next, next);
    setAnnouncement(`${TITLES.get(id) ?? id} removed.`);
    // The focused remove button is gone: land on the toolbar, not <body>.
    requestAnimationFrame(() => {
      toolbar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
  };

  const onGripKey = (id: WidgetId, e: React.KeyboardEvent) => {
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    const mode = e.shiftKey ? "resize" : "move";
    const moved = nudge(layouts[bp], id, action, mode, bp);
    const title = TITLES.get(id) ?? id;
    if (!moved) {
      setAnnouncement(mode === "move" ? `${title} can't move ${action}.` : `${title} is at its size limit.`);
      return;
    }
    commit({ ...layouts, [bp]: moved }, { [bp]: moved }, KEY_SAVE_DELAY);
    const item = moved.find((l) => l.i === id);
    if (item) {
      setAnnouncement(
        `${title}: column ${String(item.x + 1)}, row ${String(item.y + 1)}, ${String(item.w)} wide, ${String(item.h)} tall.`,
      );
    }
  };

  // The grid compacts on mount and on breakpoint changes; keep that in state, but only save user edits.
  const onLayoutChange = (layout: Layout) => {
    const next = pick(layout);
    setLayouts((prev) => (sameLayout(prev[bp], next) ? prev : { ...prev, [bp]: next }));
  };

  const onUserChange = (layout: Layout) => {
    const next = pick(layout);
    setLayouts((prev) => ({ ...prev, [bp]: next }));
    save({ [bp]: next });
  };

  const empty = onBoard.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 px-1">
        <p className="readout" aria-live="polite">
          {editing ? editNote(source, saveState) : idleNote(source, saveState)}
        </p>
        <div ref={toolbar} className="flex items-center gap-2">
          {editing && (
            <WidgetPicker
              available={available}
              onAdd={add}
            />
          )}
          {!empty && (
            <button
              type="button"
              aria-pressed={editing}
              className={buttonClass(editing ? "inverse" : "surface", "pill-sm")}
              onClick={() => {
                setEditing(!editing);
              }}
            >
              {editing ? <Check aria-hidden /> : <Pencil aria-hidden />}
              {editing ? "Done" : "Edit board"}
            </button>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      {empty ? (
        <div className="bento flex flex-col items-center pb-10">
          <EmptyState title="An empty board" body="Add a widget to start arranging your morning." />
          <WidgetPicker available={available} onAdd={add} label="Add a widget" />
        </div>
      ) : (
        <div ref={containerRef} className={cn("board -mx-2", editing && "board-editing")}>
          {mounted ? (
            <ResponsiveGridLayout
              width={width}
              breakpoints={BREAKPOINTS}
              cols={COLS}
              layouts={gridLayouts}
              rowHeight={ROW_HEIGHT}
              margin={[GAP, GAP]}
              containerPadding={[8, 8]}
              dragConfig={{ enabled: editing, cancel: "[data-no-drag]", threshold: 4 }}
              resizeConfig={{ enabled: editing, handles: ["se"] }}
              onLayoutChange={onLayoutChange}
              onDragStop={onUserChange}
              onResizeStop={onUserChange}
            >
              {onBoard.map((id) => (
                <div key={id} className="group/widget relative">
                  <div inert={editing} className="h-full">
                    {nodes[id]}
                  </div>
                  {editing && (
                    <EditChrome
                      title={TITLES.get(id) ?? id}
                      onKey={(e) => {
                        onGripKey(id, e);
                      }}
                      onRemove={() => {
                        remove(id);
                      }}
                    />
                  )}
                </div>
              ))}
            </ResponsiveGridLayout>
          ) : (
            <div aria-hidden className="min-h-88" />
          )}
        </div>
      )}
    </div>
  );
}

const LOAD_FAILED = "Couldn't load your saved board. Showing the default, not saving";

function idleNote(source: BoardSource, state: SaveState) {
  if (source === "demo") return "Demo board";
  if (source === "load-failed") return LOAD_FAILED;
  return { idle: "Your board", saving: "Saving…", saved: "Saved", failed: "Couldn't save the layout" }[state];
}

function editNote(source: BoardSource, state: SaveState) {
  if (source === "demo") return "Demo: changes reset on reload";
  if (source === "load-failed") return LOAD_FAILED;
  if (state === "failed") return "Couldn't save the layout";
  return state === "saving" ? "Saving…" : "Drag to move, corner to resize";
}

function EditChrome({
  title,
  onKey,
  onRemove,
}: {
  title: string;
  onKey: (e: React.KeyboardEvent) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-signal/40 ring-inset" />
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {/* A button so it takes focus: the keyboard path. A pointer can drag from it too. */}
        <button
          type="button"
          aria-label={`Move ${title}. Arrow keys move it, Shift with arrow keys resizes it.`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
          onKeyDown={onKey}
          className={buttonClass("surface", "circle-sm", "size-8 cursor-grab")}
        >
          <GripVertical aria-hidden />
        </button>
        <button
          type="button"
          data-no-drag
          aria-label={`Remove ${title}`}
          onClick={onRemove}
          className={buttonClass("surface", "circle-sm", "size-8")}
        >
          <X aria-hidden />
        </button>
      </div>
    </>
  );
}

function WidgetPicker({
  available,
  onAdd,
  label = "Add widget",
}: {
  available: readonly (typeof WIDGETS)[number][];
  onAdd: (id: WidgetId) => void;
  label?: string;
}) {
  return (
    <Menu>
      <MenuTrigger className={buttonClass("surface", "pill-sm")}>
        <Plus aria-hidden />
        {label}
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        {available.length === 0 ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-ink-2">
            <LayoutGrid aria-hidden className="size-4 shrink-0" />
            Every widget is on the board.
          </div>
        ) : (
          available.map((w) => (
            <MenuItem
              key={w.id}
              className="h-auto items-start py-2"
              onClick={() => {
                onAdd(w.id);
              }}
            >
              <w.icon aria-hidden className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground">{w.title}</span>
                <span className="text-[12px] text-ink-2">{w.blurb}</span>
              </span>
            </MenuItem>
          ))
        )}
      </MenuContent>
    </Menu>
  );
}
