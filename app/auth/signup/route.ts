import { NextResponse, type NextRequest } from "next/server";

import { redirectToApp, redirectToSignup } from "@/lib/auth/http";
import { mapSupabaseAuthError } from "@/lib/auth/map-supabase-error";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { createClient } from "@/lib/supabase/server";
import { parseAuthCredentials } from "@/lib/validation/auth-credentials";
import { SupabaseConfigError } from "@/lib/validation/env";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return redirectToSignup(request, { error: "csrf" });
  }

  try {
    const formData = await request.formData();
    const parsed = parseAuthCredentials(formData);

    if (!parsed.success) {
      return redirectToSignup(request, { error: "validation" });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return redirectToSignup(request, {
        error: mapSupabaseAuthError(error, "signup"),
      });
    }

    if (data.session) {
      return redirectToApp(request);
    }

    return redirectToSignup(request, { message: "check_email" });
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return redirectToSignup(request, { error: "config" });
    }
    return redirectToSignup(request, { error: "provider" });
  }
}

export function GET() {
  return new NextResponse(null, { status: 405 });
}
