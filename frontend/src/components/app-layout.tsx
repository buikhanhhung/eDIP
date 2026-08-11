import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

/**
 * `permission` hides a link the current role cannot use. Hiding is a courtesy,
 * not a control — the API refuses the call regardless of what the nav shows.
 */
const NAV_ITEMS: { to: string; label: string; end: boolean; permission?: string }[] = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/library', label: 'Thư viện', end: false },
  { to: '/search', label: 'Tìm kiếm', end: false, permission: 'search' },
  { to: '/graph', label: 'Đồ thị', end: false },
  { to: '/upload', label: 'Tải lên', end: false, permission: 'upload' },
  { to: '/audit', label: 'Nhật ký', end: false, permission: 'audit' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin — tải lên, sửa, xoá',
  user: 'User — tìm kiếm, hỏi AI',
  viewer: 'Viewer — chỉ đọc',
};

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const navItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <span className="text-lg font-semibold tracking-tight">eDIP</span>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
                <Badge title={ROLE_LABELS[user.role]}>{user.role}</Badge>
              </>
            )}
            <Button variant="outline" size="sm" onClick={logout}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
