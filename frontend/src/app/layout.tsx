import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPM",
  description: "Project Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "rounded-[10px] border shadow-lg",
              success: "border-l-2 border-l-[var(--success)]",
              error: "border-l-2 border-l-[var(--danger)]",
              warning: "border-l-2 border-l-[var(--warning)]",
            },
            style: {
              background: "var(--bg-overlay)",
              color: "var(--text-primary)",
              fontSize: "13px",
              border: "1px solid var(--border-strong)",
            },
          }}
        />
      </body>
    </html>
  );
}
