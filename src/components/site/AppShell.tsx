"use client";

import type {
  ReactNode,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Predictions",
    href: "/predictions",
  },
  {
    label: "Live Scores",
    href: "/live",
  },
  {
    label: "How It Works",
    href: "/how-it-works",
  },
] as const;

function isActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`,
    )
  );
}

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname =
    usePathname();

  /*
   * Match Intelligence currently owns its focused
   * production header. Keep that route isolated
   * until we refactor MatchWorkspace into the
   * global shell.
   */
  const focusedMatchRoute =
    pathname.startsWith(
      "/football/matches/",
    );

  if (focusedMatchRoute) {
    return children;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link
            href="/"
            className="group flex items-center gap-3"
            aria-label="DictazIQ home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-500/10 text-sm font-black text-blue-400">
              DI
            </div>

            <div>
              <div className="text-xl font-black tracking-tight">
                Dictaz
                <span className="text-blue-400">
                  IQ
                </span>
              </div>

              <div className="hidden text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500 sm:block">
                Football Intelligence
              </div>
            </div>
          </Link>

          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {navigation.map(
              (item) => {
                const active =
                  isActive(
                    pathname,
                    item.href,
                  );

                return (
                  <Link
                    key={
                      item.href
                    }
                    href={
                      item.href
                    }
                    className={
                      active
                        ? "rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300"
                        : "rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-slate-900 hover:text-white"
                    }
                  >
                    {
                      item.label
                    }
                  </Link>
                );
              },
            )}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <div className="rounded-full border border-emerald-900/70 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              ● Production
            </div>
          </div>

          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200">
              Menu
            </summary>

            <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-2xl shadow-black/40">
              {navigation.map(
                (item) => {
                  const active =
                    isActive(
                      pathname,
                      item.href,
                    );

                  return (
                    <Link
                      key={
                        item.href
                      }
                      href={
                        item.href
                      }
                      className={
                        active
                          ? "block rounded-xl bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-300"
                          : "block rounded-xl px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                      }
                    >
                      {
                        item.label
                      }
                    </Link>
                  );
                },
              )}

              <div className="mt-2 border-t border-slate-800 px-4 py-3 text-xs font-bold text-emerald-300">
                ● Production
              </div>
            </div>
          </details>
        </div>
      </header>

      <main className="flex-1">
        {
          children
        }
      </main>

      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
          <div>
            <div className="text-xl font-black">
              Dictaz
              <span className="text-blue-400">
                IQ
              </span>
            </div>

            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
              Pre-match football intelligence built from
              deterministic models, verified evidence and
              accountable published forecasts.
            </p>
          </div>

          <div className="md:text-right">
            <p className="text-xs leading-5 text-slate-500">
              DictazIQ forecasts are uncertain and experimental.
              Analytical market signals are not guarantees or
              calibrated probabilities.
            </p>

            <p className="mt-3 text-xs text-slate-600">
              © 2026 DictazIQ
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}