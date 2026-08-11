import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/app-layout';
import { ProtectedRoute } from '@/components/protected-route';
import { AuthProvider } from '@/features/auth/auth-context';
import { LoginPage } from '@/features/auth/login-page';
import { AuditPage } from '@/features/audit/audit-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { DocumentDetailPage } from '@/features/documents/document-detail-page';
import { GraphPage } from '@/features/graph/graph-page';
import { LibraryPage } from '@/features/library/library-page';
import { SearchPage } from '@/features/search/search-page';
import { UploadPage } from '@/features/upload/upload-page';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route
                path="/upload"
                element={
                  <ProtectedRoute permission="upload">
                    <UploadPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/search"
                element={
                  <ProtectedRoute permission="search">
                    <SearchPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/graph" element={<GraphPage />} />
              <Route
                path="/audit"
                element={
                  <ProtectedRoute permission="audit">
                    <AuditPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/documents/:id" element={<DocumentDetailPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
