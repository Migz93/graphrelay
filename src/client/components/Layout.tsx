import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Beaker, CalendarDays, Code2, LayoutDashboard, ListChecks, LogOut, Menu, Server, Settings } from "lucide-react";
import { useDialogA11y } from "../hooks/useDialogA11y";

type SessionUser = { username: string; displayName: string; email?: string };

export type BuildInfo = { version: string; channel: string; revision: string };

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/todo", label: "To Do", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ user, onLogout, build, children }: { build: BuildInfo; user: SessionUser | null; onLogout: () => void; children: React.ReactNode }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const drawerBackdropRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [accountOpen]);

  // Below the md breakpoint the sidebar is only ever a dialog when open — it's
  // translated off-screen otherwise, but without `inert` its links stay in
  // the Tab order, so a keyboard user has to tab through the whole hidden
  // nav before reaching visible page content.
  const [belowMdBreakpoint, setBelowMdBreakpoint] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateBreakpoint = () => {
      setBelowMdBreakpoint(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileOpen(false);
    };
    updateBreakpoint();
    mediaQuery.addEventListener("change", updateBreakpoint);
    return () => mediaQuery.removeEventListener("change", updateBreakpoint);
  }, []);

  // Above md the sidebar is the permanent desktop nav, never a dialog, even if
  // it was opened as a mobile drawer right before the viewport crossed the
  // breakpoint (e.g. a tablet rotation) — without this check it would keep
  // trapping Tab focus and announcing role="dialog" at a width where it isn't
  // presented as one.
  const drawerIsDialog = mobileOpen && belowMdBreakpoint;
  const sidebarRef = useDialogA11y<HTMLElement>(drawerIsDialog, () => setMobileOpen(false), undefined, [drawerBackdropRef]);

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      {mobileOpen && <button ref={drawerBackdropRef} type="button" className="fixed inset-0 z-30 bg-overlay/50 md:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside
        id="mobile-sidebar"
        ref={sidebarRef}
        role={drawerIsDialog ? "dialog" : undefined}
        aria-modal={drawerIsDialog ? true : undefined}
        aria-label={drawerIsDialog ? "Navigation menu" : undefined}
        inert={belowMdBreakpoint && !mobileOpen}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-outline-variant/30 bg-background-container-low transition-transform duration-300 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center gap-3 border-b border-outline-variant/30 px-6 py-5">
          <div className="grid size-8 shrink-0 place-items-center"><img className="block size-8" src="/graphrelay-logo.svg" alt="GraphRelay" /></div>
          <div className="min-w-0">
            <div className="font-headline text-sm font-bold leading-[1.1]">GraphRelay</div>
            <div className="mt-0.5 truncate text-xs leading-tight text-on-surface-variant">Microsoft 365 tools</div>
          </div>
        </div>
        <nav aria-label="Main navigation" className="grid flex-1 content-start gap-0.5 overflow-y-auto px-3 py-4">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium leading-5 no-underline ${isActive ? "bg-primary-dim text-on-surface" : "text-on-surface-variant hover:bg-background-container-high hover:text-on-surface"}`}
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="relative border-t border-outline-variant/30 px-3 pt-4 pb-2" ref={accountRef}>
          {user && <>
            {accountOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-10 overflow-hidden rounded-xl border border-outline-variant/30 bg-background-container-highest shadow-lg">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-outline-variant/30 px-4 py-3 text-sm font-medium">
                  <div>{user.username}</div>
                  {user.email && <small className="mt-0.5 block overflow-hidden text-ellipsis text-xs font-normal text-on-surface-variant">{user.email}</small>}
                </div>
                <button type="button" className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-sm font-medium text-on-surface-variant hover:bg-background-bright hover:text-on-surface" onClick={() => { setAccountOpen(false); onLogout(); }}><LogOut size={16} strokeWidth={1.75} /> Sign out</button>
              </div>
            )}
            <button type="button" className="flex w-full min-w-0 items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-on-surface hover:bg-background-container-high" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background-bright text-xs font-semibold text-on-surface-variant">{user.displayName.charAt(0).toUpperCase()}</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{user.displayName}</span>
            </button>
          </>}
        </div>
        <VersionFooter build={build} onNavigate={() => setMobileOpen(false)} />
      </aside>
      <div className="min-w-0 flex-1 md:ml-64">
        <div className="flex items-center gap-3 border-b border-outline-variant/30 bg-background-container-low px-4 py-3 md:hidden">
          <button type="button" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-background-container-high hover:text-on-surface" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileOpen} aria-controls="mobile-sidebar">
            <Menu size={20} />
          </button>
          <img className="size-6 shrink-0" src="/graphrelay-logo.svg" alt="GraphRelay" />
          <span className="font-headline text-sm font-bold">GraphRelay</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function VersionFooter({ build, onNavigate }: { build: BuildInfo; onNavigate: () => void }) {
  const stable = build.channel === "stable";
  const develop = build.channel === "develop";
  const Icon = stable ? Server : develop ? Beaker : Code2;
  const label = stable ? "GraphRelay Stable" : develop ? "GraphRelay Develop" : "Custom Build";
  return <div className="px-3 pb-3">
    <Link className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-on-surface no-underline hover:bg-background-container-high" to="/settings?tab=about" onClick={onNavigate}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-bright text-on-surface-variant group-hover:text-on-surface"><Icon size={16} strokeWidth={1.75} /></span>
      <span><strong className="block text-xs font-semibold leading-tight">{label}</strong><small className="mt-0.5 block font-mono text-xs leading-tight text-on-surface-variant">{stable ? "v" + build.version : build.revision.slice(0, 7)}</small></span>
    </Link>
  </div>;
}
