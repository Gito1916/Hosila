import { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';

import { adminApi } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { LoginPage } from '@/pages/LoginPage';
import { HotelDetailPage } from '@/pages/HotelDetailPage';
import { HotelHistoryPage } from '@/pages/HotelHistoryPage';
import { HotelsPage } from '@/pages/HotelsPage';
import type { AdminMeResponse } from '@/types/admin';

function ProtectedShell({
  me,
  onSignOut,
}: {
  me: AdminMeResponse;
  onSignOut: () => Promise<void>;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-shell">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#11131a]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link className="flex items-center gap-3 text-white" to="/hotels">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/18 text-emerald-200">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-white/40">Hosila Admin</p>
                <p className="text-sm font-semibold text-white">Subscription Control Plane</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
              <Link
                className={`nav-pill ${location.pathname.startsWith('/hotels') ? 'nav-pill-active' : ''}`}
                to="/hotels"
              >
                Hotels
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/65 md:block">
              {me.full_name || me.email || 'Platform admin'}
            </div>
            <button className="ghost-button" type="button" onClick={() => void onSignOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function AppRoutes() {
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadAdminSession = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setIsAuthenticated(false);
      setMe(null);
      setAccessError(null);
      setSessionReady(true);
      return;
    }

    setIsAuthenticated(true);

    try {
      const response = await adminApi.me();
      setMe(response);
      setAccessError(null);
    } catch (requestError) {
      setMe(null);
      setAccessError(
        requestError instanceof Error ? requestError.message : 'Unable to verify platform admin access',
      );
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    void loadAdminSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setSessionReady(false);
      void loadAdminSession();
    });

    return () => subscription.unsubscribe();
  }, [loadAdminSession]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMe(null);
    setAccessError(null);
  }

  if (!sessionReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-shell px-6">
        <div className="panel max-w-xl text-center">
          <p className="eyebrow justify-center">Booting</p>
          <h1 className="mt-4 font-display text-4xl text-white">Loading admin session</h1>
          <p className="mt-3 text-sm text-white/58">
            Checking Supabase auth and verifying platform admin access.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage
            sessionReady={sessionReady}
            isAuthenticated={isAuthenticated}
            me={me}
            accessError={accessError}
          />
        }
      />

      <Route
        element={
          isAuthenticated && me ? (
            <ProtectedShell me={me} onSignOut={handleSignOut} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="/hotels" replace />} />
        <Route path="/hotels" element={<HotelsPage plans={me?.plans ?? []} />} />
        <Route path="/hotels/:hotelId" element={<HotelDetailPage plans={me?.plans ?? []} />} />
        <Route path="/hotels/:hotelId/history" element={<HotelHistoryPage />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? '/hotels' : '/login'} replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
