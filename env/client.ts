import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Client environment schema. Values must be literal `process.env.NEXT_PUBLIC_*`
// reads: Next inlines them into the browser bundle by text substitution.
export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
});
