import { timestamp } from "drizzle-orm/pg-core";

// Shared timestamp columns. `updated_at` moves on Drizzle updates; upserts set it themselves.
export const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
