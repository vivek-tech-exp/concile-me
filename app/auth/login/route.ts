import { NextResponse, type NextRequest } from "next/server";

import { redirectToApp, redirectToLogin } from "@/lib/auth/http";
import { createClient } from "@/lib/supabase/server";
import { parseAuthCredentials } from "@/lib/validation/auth-credentials";
import { SupabaseConfigError } from "@/lib/validation/env";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const parsed = parseAuthCredentials(formData);

    if (!parsed.success) {
      return redirectToLogin(request, "validation");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return redirectToLogin(request, "invalid_credentials");
    }

    return redirectToApp(request);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return redirectToLogin(request, "config");
    }
    return redirectToLogin(request, "provider");
  }
}

export function GET() {
  return new NextResponse(null, { status: 405 });
}
