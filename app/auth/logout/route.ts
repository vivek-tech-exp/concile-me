import { NextResponse, type NextRequest } from "next/server";

import { redirectToLogin } from "@/lib/auth/http";
import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/validation/env";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return redirectToLogin(request);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return redirectToLogin(request, "config");
    }
    return redirectToLogin(request);
  }
}

export function GET() {
  return new NextResponse(null, { status: 405 });
}
