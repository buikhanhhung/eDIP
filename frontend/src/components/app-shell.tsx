import { motion } from 'framer-motion';
import {
  Cloud,
  FileText,
  LayoutDashboard,
  LogOut,
  Network,
  ScrollText,
  Search,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Hidden when the role lacks it — the API refuses regardless. */
  permission?: string;
}

/**
 * Grouped the way the work runs: read what is there, put something new in,
 * then check what happened. Headings earn their place by marking those
 * shifts — they are not decoration between a flat list.
 */
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Explore',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/library', label: 'Library', icon: FileText },
      { to: '/search', label: 'Search', icon: Search, permission: 'search' },
      { to: '/graph', label: 'Graph', icon: Network },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { to: '/upload', label: 'Upload', icon: Upload, permission: 'upload' },
      { to: '/sources', label: 'Sources', icon: Cloud, permission: 'upload' },
      { to: '/audit', label: 'Activity log', icon: ScrollText, permission: 'audit' },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Full access',
  user: 'Search and ask',
  viewer: 'Read only',
};

export function AppShell() {
  const { user, logout, can } = useAuth();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-bg-weak-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-stroke-soft-200 bg-bg-white-0 lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/ecv-mark.png" alt="" className="size-9 shrink-0 rounded-lg object-cover" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text-strong-950">eDIP</p>
            <p className="text-[11px] text-text-soft-400">Document Intelligence</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.heading} className="space-y-1">
              <p className="px-2 pb-1 text-subheading-xs font-medium uppercase text-text-soft-400">
                {group.heading}
              </p>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="block">
                  {({ isActive }) => (
                    <span
                      className={cn(
                        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-default',
                        isActive
                          ? 'bg-bg-weak-50 font-medium text-text-strong-950'
                          : 'text-text-sub-600 hover:bg-bg-weak-50',
                      )}
                    >
                      {isActive && (
                        // One element shared across items, so the marker slides
                        // between them instead of blinking out and back.
                        <motion.span
                          layoutId="nav-indicator"
                          className="absolute -left-3 h-5 w-1 rounded-r-full bg-primary-base"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          'size-[18px] shrink-0 transition-default',
                          isActive ? 'text-primary-base' : 'text-text-soft-400',
                        )}
                      />
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {user && (
          <div className="border-t border-stroke-soft-200 p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <img src="/ecv-mark.png" alt="" className="size-8 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium text-text-strong-950">
                  {user.email.split('@')[0]}
                </p>
                <p className="truncate text-[11px] text-text-soft-400">
                  {ROLE_LABELS[user.role] ?? user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="rounded-md p-1.5 text-text-soft-400 transition-default hover:bg-bg-weak-50 hover:text-danger-base"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Below lg the sidebar is a top bar: the same items, laid out to scroll
          sideways rather than squeeze. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stroke-soft-200 bg-bg-white-0 px-4 py-2.5 lg:hidden">
        <img src="/ecv-mark.png" alt="" className="size-7 shrink-0 rounded-lg object-cover" />
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {groups.flatMap((group) => group.items).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-default',
                  isActive
                    ? 'bg-primary-lighter font-medium text-primary-base'
                    : 'text-text-sub-600',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          className="shrink-0 rounded-md p-1.5 text-text-soft-400 hover:text-danger-base"
        >
          <LogOut className="size-4" />
        </button>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
