import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Revenue Reconciliation",
  description:
    "Reconcile order exports with payment-processor activity and investigate discrepancies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
