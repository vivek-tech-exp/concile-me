export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Revenue Reconciliation
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to import data and reconcile revenue.
        </p>
      </div>
      {children}
    </div>
  );
}
