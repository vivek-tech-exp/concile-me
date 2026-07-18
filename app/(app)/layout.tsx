import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div>
            <p className="text-sm font-medium">Revenue Reconciliation</p>
            <p className="text-xs text-muted-foreground">
              Protected application shell (scaffolding — route protection comes in Stage 2)
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
