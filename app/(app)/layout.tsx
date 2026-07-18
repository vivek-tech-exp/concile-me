import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/validation/env";

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      redirect("/login?error=config");
    }
    throw error;
  }

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Revenue Reconciliation</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email ?? "Signed in"}
            </p>
          </div>
          <form action="/auth/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
