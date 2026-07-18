import { z } from "zod";

export const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    protocol: /^https?$/,
    error: "NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

export class SupabaseConfigError extends Error {
  readonly code = "config" as const;

  constructor(message = "Supabase is not configured. Check your environment variables.") {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export function parseSupabaseEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SupabaseEnv {
  const result = supabaseEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw new SupabaseConfigError();
  }

  return result.data;
}

export function getSupabaseEnv(): SupabaseEnv {
  return parseSupabaseEnv(process.env);
}
