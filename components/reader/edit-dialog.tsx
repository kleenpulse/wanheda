"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { FIELD, LABEL } from "@/components/money/form-kit";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { cleanTags, formatBytes, TAGS_MAX, TITLE_MAX, type Collection, type ReaderDoc } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { kindLabel } from "./cover";
import { useReaderApi } from "./use-reader";

// Editing a document's details (title, author, tags, collections) and
// creating or renaming a collection, in the house grow dialog.

export type Editing =
  | { kind: "doc"; doc: ReaderDoc; origin: DOMRect }
  | { kind: "collection"; collection: Collection | null; origin: DOMRect };

export function EditDialog({ editing, collections, onClose }: { editing: Editing | null; collections: readonly Collection[]; onClose: () => void }) {
  // Kept while the dialog shrinks away, so its content doesn't blank mid-exit.
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);
  const title = shown?.kind === "doc" ? "Edit details" : shown?.collection ? "Rename collection" : "New collection";
  return (
    <GrowDialog
      open={editing !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      originRect={shown?.origin ?? null}
      maxWidth={shown?.kind === "doc" ? 480 : 380}
    >
      {shown?.kind === "doc" ? <DocForm key={shown.doc.id} doc={shown.doc} collections={collections} onDone={onClose} /> : null}
      {shown?.kind === "collection" ? <CollectionForm key={shown.collection?.id ?? "new"} initial={shown.collection} onDone={onClose} /> : null}
    </GrowDialog>
  );
}

function DocForm({ doc, collections, onDone }: { doc: ReaderDoc; collections: readonly Collection[]; onDone: () => void }) {
  const api = useReaderApi();
  const [title, setTitle] = React.useState(doc.title);
  const [author, setAuthor] = React.useState(doc.author ?? "");
  const [tags, setTags] = React.useState(doc.tags.join(", "));
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => new Set(doc.collections));
  const [newName, setNewName] = React.useState("");
  const [extra, setExtra] = React.useState<Collection[]>([]);
  const all = [...collections, ...extra.filter((c) => !collections.some((x) => x.id === c.id))];

  const toggle = (id: string) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCollection = async () => {
    const name = newName.trim();
    if (!name) return;
    const known = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (known) {
      setPicked((s) => new Set([...s, known.id]));
      setNewName("");
      return;
    }
    const saved = await api.saveCollection({ id: crypto.randomUUID(), name: name.slice(0, 60) });
    if (!saved) return;
    setExtra((x) => [...x, saved]);
    setPicked((s) => new Set([...s, saved.id]));
    setNewName("");
  };

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    api.update({
      id: doc.id,
      title: t.slice(0, TITLE_MAX),
      author: author.trim() ? author.trim().slice(0, 200) : null,
      tags: cleanTags(tags.split(",")),
      collections: [...picked].filter((id) => all.some((c) => c.id === id)),
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <span className={LABEL}>Title</span>
        <input value={title} onChange={(e) => { setTitle(e.target.value); }} maxLength={TITLE_MAX} required className={FIELD} />
      </label>
      <label>
        <span className={LABEL}>Author</span>
        <input value={author} onChange={(e) => { setAuthor(e.target.value); }} maxLength={200} placeholder="Optional" className={FIELD} />
      </label>
      <label>
        <span className={LABEL}>Tags</span>
        <input value={tags} onChange={(e) => { setTags(e.target.value); }} placeholder="design, evenings" className={FIELD} />
        <span className="mt-1 block text-[11.5px] text-ink-3">Separate with commas. Up to {TAGS_MAX}.</span>
      </label>
      <fieldset>
        <legend className={LABEL}>Collections</legend>
        <div className="flex flex-wrap gap-2">
          {all.map((c) => {
            const on = picked.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => { toggle(c.id); }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-signal-soft text-signal-ink" : "bg-foreground/6 text-ink-2 hover:text-foreground dark:bg-card-nested",
                )}
              >
                {on ? <Check aria-hidden className="size-3.5" /> : null}
                {c.name}
              </button>
            );
          })}
          <span className="flex items-center gap-1">
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCollection();
                }
              }}
              maxLength={60}
              placeholder="New collection"
              aria-label="New collection name"
              className="h-8 w-36 rounded-pill bg-foreground/6 px-3 dark:bg-card-nested text-[12.5px] text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="button" onClick={() => void addCollection()} disabled={!newName.trim()} className={buttonClass("ghost", "circle-sm", "size-8")}>
              <Plus aria-hidden className="size-4" />
              <span className="sr-only">Add collection</span>
            </button>
          </span>
        </div>
      </fieldset>
      <p className="tabular font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">
        {kindLabel(doc.kind)} · {formatBytes(doc.sizeBytes)}
        {doc.fileName ? ` · ${doc.fileName}` : ""}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost", "pill-sm")}>
          Cancel
        </button>
        <button type="submit" disabled={!title.trim()} className={buttonClass("inverse", "pill-sm")}>
          Save
        </button>
      </div>
    </form>
  );
}

function CollectionForm({ initial, onDone }: { initial: Collection | null; onDone: () => void }) {
  const api = useReaderApi();
  const [name, setName] = React.useState(initial?.name ?? "");
  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    void api.saveCollection({ id: initial?.id ?? crypto.randomUUID(), name: n.slice(0, 60) });
    onDone();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <span className={LABEL}>Name</span>
        <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={60} required placeholder="Evenings" className={FIELD} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost", "pill-sm")}>
          Cancel
        </button>
        <button type="submit" disabled={!name.trim()} className={buttonClass("inverse", "pill-sm")}>
          {initial ? "Rename" : "Create"}
        </button>
      </div>
    </form>
  );
}
