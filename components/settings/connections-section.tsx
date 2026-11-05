"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import {
  addPolarConnector,
  archiveProduct,
  mapPolarProducts,
  removeConnector,
  replacePolarToken,
  saveProduct,
  setWebhookSecret,
  syncNow,
  type ConnectorFail,
} from "@/actions/connectors";
import { FIELD } from "@/components/money/form-kit";
import { CategoryDot } from "@/components/money/money-text";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useNow } from "@/hooks/use-now";
import { fetchJson } from "@/lib/fetch-json";
import { relativeTime } from "@/lib/notifications/notifications";
import { CONNECTIONS_KEY, mergeProductMap, PRODUCT_COLORS, type ConnectionsPayload, type ConnectorView, type Product, type ProductColor } from "@/lib/saas/connectors";
import type { PolarServer } from "@/lib/saas/polar/client";
import { cn } from "@/lib/utils";

// Settings › Connections (T40, FRD 4.5): the Polar connector, the products it
// feeds and which Polar product counts as which. Secrets go in and never come
// back: the screen only ever sees "set" and a token's last four (SPEC V33).

const UNMAPPED = "__none";

const noSubscribe = () => () => undefined;

/** The page origin after hydration (null on the server), for the webhook URL. */
function useOrigin(): string | null {
  return React.useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
}

function useConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => fetchJson<ConnectionsPayload>("/api/connections"),
    staleTime: 30_000,
  });
}

function failText(fail: ConnectorFail): string {
  switch (fail.reason) {
    case "polar":
      return fail.error;
    case "demo":
      return "Demo mode: nothing is saved.";
    case "off":
      return "Connectors are off on this deployment.";
    case "broken":
      return "The stored secret can't be opened (the seal key changed). Enter the token again.";
    case "missing":
      return "That connector is gone. Reload the page.";
    case "invalid":
      return "That doesn't look right. Check it and try again.";
    case "failed":
      return "The server didn't take it. Try again.";
  }
}

export function ConnectionsSection() {
  const { data, isError } = useConnections();
  if (!data) {
    return (
      <SettingsCard title="Polar">
        <SettingRow label={isError ? "Couldn't load connections" : "Loading…"} description={isError ? "Check the connection and reload." : undefined} />
      </SettingsCard>
    );
  }
  // One Polar connector per owner for now (one organization, user 2026-11-05).
  const polar = data.connectors[0] ?? null;
  return (
    <div className="flex flex-col gap-6">
      {data.available ? (
        polar ? (
          <PolarConnector connector={polar} webhookPath={data.webhookPath} />
        ) : (
          <SettingsCard title="Polar">
            <ConnectForm />
          </SettingsCard>
        )
      ) : (
        <SettingsCard title="Polar">
          <SettingRow
            label={data.demo ? "Demo mode" : "Connectors are off"}
            description={
              data.demo
                ? "With a database and sign-in set up, Polar connects here. Income shows sample data until then."
                : "Set CONNECTOR_SEAL_KEY (32 random bytes, base64) on this deployment to store connector secrets. Income shows sample data until then."
            }
          />
        </SettingsCard>
      )}
      <ProductsCard products={data.products} editable={data.available} />
      {polar && data.available ? <MappingCard connector={polar} products={data.products} /> : null}
    </div>
  );
}

function ConnectForm() {
  const qc = useQueryClient();
  const [server, setServer] = React.useState<PolarServer>("production");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await addPolarConnector({ id: crypto.randomUUID(), server, token }).catch(() => ({ ok: false as const, reason: "failed" as const }));
    setBusy(false);
    if (!result.ok) {
      setError(failText(result));
      return;
    }
    setToken("");
    await qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    toast({ title: "Polar connected", body: "Add the webhook below, then sync." });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <SettingRow
        label="Connect Polar"
        description="An Organization Access Token with read access to products, subscriptions, orders and refunds. It's checked with Polar first, then stored sealed."
        layout="stack"
      >
        {(labelId) => (
          <div className="flex flex-col gap-3">
            <Segmented
              label="Polar server"
              value={server}
              options={[
                { value: "production", label: "Production" },
                { value: "sandbox", label: "Sandbox" },
              ]}
              onChange={(v) => {
                setServer(v);
              }}
              className="self-start"
            />
            <div className="flex flex-col gap-2 @lg:flex-row">
              <input
                aria-labelledby={labelId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="polar_oat_…"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                }}
                className={cn(FIELD, "font-mono")}
              />
              <button type="submit" disabled={busy || token.trim().length < 10} className={buttonClass("inverse", "pill")}>
                {busy ? "Checking…" : "Connect"}
              </button>
            </div>
            {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          </div>
        )}
      </SettingRow>
    </form>
  );
}

/** One masked field with a Save button, for replacing a token or setting the webhook secret. */
function SecretField({ labelId, placeholder, onSave }: { labelId: string; placeholder: string; onSave: (value: string) => Promise<ConnectorFail | null> }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void onSave(value.trim()).then((fail) => {
          setBusy(false);
          if (fail) setError(failText(fail));
          else setValue("");
        });
      }}
    >
      <div className="flex flex-col gap-2 @lg:flex-row">
        <input
          aria-labelledby={labelId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          className={cn(FIELD, "font-mono")}
        />
        <button type="submit" disabled={busy || value.trim().length < 10} className={buttonClass("surface", "pill")}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
    </form>
  );
}

function PolarConnector({ connector: c, webhookPath }: { connector: ConnectorView; webhookPath: string }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
  const origin = useOrigin();
  const url = origin ? `${origin}${webhookPath}/${c.id}` : null;
  const [syncing, setSyncing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const now = useNow(30_000);

  const sync = async () => {
    setSyncing(true);
    const result = await syncNow({ id: c.id }).catch(() => ({ ok: false as const, reason: "failed" as const }));
    setSyncing(false);
    await refresh();
    if (!result.ok) {
      toast({ title: "Sync failed", body: failText(result) });
      return;
    }
    toast({
      title: result.added === 0 ? "Already up to date" : `${result.added} new billing ${result.added === 1 ? "event" : "events"}`,
      ...(result.skipped > 0 ? { body: `${result.skipped} objects Polar sent couldn't be read and were skipped.` } : {}),
    });
  };

  const remove = async () => {
    const result = await removeConnector({ id: c.id }).catch(() => ({ ok: false as const, reason: "failed" as const }));
    if (!result.ok) {
      setConfirming(false);
      toast({ title: "Not removed", body: failText(result) });
      return;
    }
    await refresh();
    toast({ title: "Polar disconnected" });
  };

  return (
    <SettingsCard title={c.server === "sandbox" ? "Polar · sandbox" : "Polar"}>
      <SettingRow
        label="Access token"
        description={c.sealBroken ? failText({ ok: false, reason: "broken" }) : <span className="font-mono tabular">{c.tokenHint}</span>}
        layout="wide"
      >
        {(labelId) => (
          <SecretField
            labelId={labelId}
            placeholder="New token"
            onSave={async (token) => {
              const r = await replacePolarToken({ id: c.id, token }).catch(() => ({ ok: false as const, reason: "failed" as const }));
              if (!r.ok) return r;
              await refresh();
              toast({ title: "Token replaced" });
              return null;
            }}
          />
        )}
      </SettingRow>
      <SettingRow
        label={
          <>
            Webhook
            <span className={cn("readout rounded-pill px-2 py-0.5", c.webhookSecretSet ? "bg-signal/12 text-signal" : "bg-muted text-ink-2")}>
              {c.webhookSecretSet ? "secret set" : "no secret"}
            </span>
          </>
        }
        description="In Polar › Settings › Webhooks, add this URL with the subscription, order and refund events, then paste the secret Polar shows."
        layout="stack"
      >
        {(labelId) => (
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-[12px] bg-muted px-3 py-2 dark:bg-card-nested">
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">{url ?? "…"}</code>
              <button
                type="button"
                aria-label="Copy webhook URL"
                disabled={!url}
                onClick={() => {
                  if (!url) return;
                  void navigator.clipboard.writeText(url).then(() => {
                    toast({ title: "Webhook URL copied" });
                  });
                }}
                className={buttonClass("ghost", "circle-sm")}
              >
                <Copy aria-hidden />
              </button>
            </div>
            <SecretField
              labelId={labelId}
              placeholder={c.webhookSecretSet ? "Replace the webhook secret" : "Webhook secret"}
              onSave={async (secret) => {
                const r = await setWebhookSecret({ id: c.id, secret }).catch(() => ({ ok: false as const, reason: "failed" as const }));
                if (!r.ok) return r;
                await refresh();
                toast({ title: "Webhook secret saved" });
                return null;
              }}
            />
          </div>
        )}
      </SettingRow>
      <SettingRow
        label="Sync"
        description={
          c.lastError ? (
            <span className="text-destructive">{c.lastError}</span>
          ) : c.lastSyncedAt && now !== null ? (
            `Last synced ${relativeTime(Date.parse(c.lastSyncedAt), now)}. Pulls every subscription, order and refund; anything a missed webhook dropped comes back here.`
          ) : (
            "Never synced. The first sync pulls your whole Polar history."
          )
        }
        layout="wide"
      >
        {() => (
          <button
            type="button"
            onClick={() => {
              void sync();
            }}
            disabled={syncing || c.sealBroken} className={buttonClass("surface", "pill")}>
            <RefreshCw aria-hidden className={cn(syncing && "animate-spin motion-reduce:animate-none")} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </SettingRow>
      <SettingRow label="Disconnect" description="Deletes the token and every billing event pulled from Polar. Your products stay." layout="wide">
        {() =>
          confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-[13px] text-ink-2">Delete?</span>
              <button type="button" aria-label="Yes, disconnect" onClick={() => {
                  void remove();
                }}
                className={buttonClass("ghost", "circle-sm", "bg-destructive/12 text-destructive hover:bg-destructive/20")}>
                <Check aria-hidden />
              </button>
              <button type="button" aria-label="Cancel" autoFocus onClick={() => {
                  setConfirming(false);
                }}
                className={buttonClass("ghost", "circle-sm")}>
                <X aria-hidden />
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => {
                setConfirming(true);
              }}
              className={buttonClass("ghost", "pill", "text-destructive hover:bg-destructive/10 hover:text-destructive")}>
              Disconnect
            </button>
          )
        }
      </SettingRow>
    </SettingsCard>
  );
}

function ProductsCard({ products, editable }: { products: Product[]; editable: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [color, setColor] = React.useState<ProductColor>("violet");

  const put = (fn: (list: Product[]) => Product[]) => qc.setQueryData<ConnectionsPayload>(CONNECTIONS_KEY, (p) => (p ? { ...p, products: fn(p.products) } : p));

  const add = () => {
    const product: Product = { id: crypto.randomUUID(), name: name.trim(), url: url.trim(), color };
    if (!product.name) return;
    // Optimistic (V24); rolled back if the server refuses it.
    put((list) => [...list, product]);
    setName("");
    setUrl("");
    void saveProduct(product)
      .catch(() => ({ ok: false as const, reason: "failed" as const }))
      .then((r) => {
        if (r.ok) return;
        put((list) => list.filter((p) => p.id !== product.id));
        toast({ title: "Product not saved", body: failText(r) });
      });
  };

  const archive = (product: Product) => {
    put((list) => list.filter((p) => p.id !== product.id));
    toast({
      title: `${product.name} archived`,
      body: "Its MRR history stays.",
      action: {
        label: "Undo",
        onClick: () => {
          put((list) => [...list, product]);
        },
      },
      closeLabel: "Cancel archive",
      onClose: () => {
        put((list) => (list.some((p) => p.id === product.id) ? list : [...list, product]));
      },
      onExpire: () => {
        void archiveProduct({ id: product.id })
          .catch(() => ({ ok: false as const, reason: "failed" as const }))
          .then((r) => {
            if (r.ok) {
              void qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
              return;
            }
            put((list) => [...list, product]);
            toast({ title: "Not archived", body: failText(r) });
          });
      },
    });
  };

  return (
    <SettingsCard title="Products">
      {products.length === 0 ? <SettingRow label="No products yet" description="Each SaaS you run is one product. Polar products are mapped onto them below." /> : null}
      {products.map((p) => (
        <SettingRow
          key={p.id}
          label={
            <>
              <CategoryDot color={p.color} className="size-2.5" />
              {p.name}
            </>
          }
          description={p.url || undefined}
          {...(editable
            ? {
                children: () => (
                  <button
                    type="button"
                    onClick={() => {
                      archive(p);
                    }}
                    className={buttonClass("ghost", "pill-sm")}>
                    Archive
                  </button>
                ),
              }
            : {})}
        />
      ))}
      {editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <SettingRow label="Add a product" layout="stack">
            {(labelId) => (
              <div className="grid gap-2 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <input aria-labelledby={labelId} placeholder="Name" value={name} maxLength={60} onChange={(e) => {
                    setName(e.target.value);
                  }} className={FIELD} />
                <input aria-label="Product URL" placeholder="https://… (optional)" value={url} maxLength={200} onChange={(e) => {
                    setUrl(e.target.value);
                  }} className={FIELD} />
                <Select items={PRODUCT_COLORS.map((c) => ({ value: c, label: c }))} value={color} onValueChange={(v) => {
                    if (v) setColor(v);
                  }}>
                  <SelectTrigger aria-label="Colour" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <CategoryDot color={c} />
                          {c}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="submit" disabled={!name.trim()} className={buttonClass("surface", "pill")}>
                  <Plus aria-hidden />
                  Add
                </button>
              </div>
            )}
          </SettingRow>
        </form>
      ) : null}
    </SettingsCard>
  );
}

function MappingCard({ connector: c, products }: { connector: ConnectorView; products: Product[] }) {
  const qc = useQueryClient();
  const polarProducts = c.products.filter((p) => !p.archived || c.productMap[p.id]);
  const items = [{ value: UNMAPPED, label: "Not counted" }, ...products.map((p) => ({ value: p.id, label: p.name }))];

  const map = (polarId: string, next: string) => {
    const productId = next === UNMAPPED ? null : next;
    const before = c.productMap[polarId] ?? null;
    const apply = (target: string | null) =>
      qc.setQueryData<ConnectionsPayload>(CONNECTIONS_KEY, (p) =>
        p
          ? {
              ...p,
              connectors: p.connectors.map((x) => {
                if (x.id !== c.id) return x;
                return { ...x, productMap: mergeProductMap(x.productMap, { [polarId]: target }) };
              }),
            }
          : p,
      );
    apply(productId);
    void mapPolarProducts({ id: c.id, map: { [polarId]: productId } })
      .catch(() => ({ ok: false as const, reason: "failed" as const }))
      .then((r) => {
        if (r.ok) return;
        apply(before);
        toast({ title: "Mapping not saved", body: failText(r) });
      });
  };

  return (
    <SettingsCard title="Polar products">
      {polarProducts.length === 0 ? (
        <SettingRow label="No Polar products seen yet" description="Sync, and the products in your Polar organization show up here." />
      ) : (
        polarProducts.map((p) => (
          <SettingRow key={p.id} label={p.name} description={[p.recurring ? "Subscription" : "One-time", p.archived ? "archived in Polar" : null].filter(Boolean).join(" · ")}>
            {(labelId) => (
              <div className="w-44">
                <Select items={items} value={c.productMap[p.id] ?? UNMAPPED} onValueChange={(v) => {
                    if (v) map(p.id, v);
                  }}>
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </SettingRow>
        ))
      )}
    </SettingsCard>
  );
}
