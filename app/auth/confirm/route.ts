import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

import { redirectToApp, redirectToLogin } from "@/lib/auth/http";
import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/validation/env";

const CONFIRM_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isEmailOtpType(value: string): value is EmailOtpType {
  return CONFIRM_TYPES.has(value as EmailOtpType);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");

  if (!tokenHash || !typeParam || !isEmailOtpType(typeParam)) {
    return redirectToLogin(request, "confirmation_expired");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: typeParam,
      token_hash: tokenHash,
    });

    if (error) {
      return redirectToLogin(request, "confirmation_expired");
    }

    return redirectToApp(request);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return redirectToLogin(request, "config");
    }
    return redirectToLogin(request, "confirmation_expired");
  }
}
