import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';

interface Props {
  children: ReactNode;
  /** Permission the route needs beyond being signed in. */
  permission?: string;
}

/**
 * The API refuses every route without a token, so the app has no anonymous
 * mode to fall back on: an unauthenticated visitor goes to the login screen and
 * comes back to where they were headed.
 *
 * The permission check is a courtesy, not a control — the API rejects the call
 * regardless. It exists because hiding a nav link does nothing for someone who
 * types the URL, and a page that explains the refusal reads better than a form
 * that answers every submission with a red error.
 */
export function ProtectedRoute({ children, permission }: Props) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Đang tải phiên làm việc…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !can(permission)) {
    return (
      <div className="space-y-2 py-16 text-center">
        <h1 className="text-xl font-semibold">Không đủ quyền</h1>
        <p className="text-sm text-muted-foreground">
          Trang này cần quyền <span className="font-medium">{permission}</span>, mà vai trò{' '}
          <span className="font-medium">{user.role}</span> không có.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
