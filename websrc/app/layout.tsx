import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuthButton } from "./components/AuthButton";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SuperOffice Provisioning Portal",
  description:
    "Web console for provisioning SuperOffice CRM entities using SuperOffice.WebApi, faker-driven data, and manifest-based storage."
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/templates", label: "Templates" },
  { href: "/jobs", label: "Jobs" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Providers>
          <div className="flex min-h-screen">
            <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white/70 p-6 md:flex">
              <div className="mb-8">
                <p className="text-xs uppercase tracking-widest text-slate-500">SuperOffice</p>
                <h1 className="text-2xl font-semibold text-slate-900">Provisioning</h1>
              </div>
              <nav className="flex flex-col gap-2 text-sm font-medium text-slate-600">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto space-y-3">
                <AuthButton />
                <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Secrets policy</p>
                  <p>All credentials must be provided via .env / deployment secrets.</p>
                </div>
              </div>
            </aside>
            <main className="flex-1">
              <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
