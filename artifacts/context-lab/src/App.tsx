import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';

import { LandingPage } from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import EventsHistory from '@/pages/events-list';
import EventWorkflow from '@/pages/event-workflow';
import Predictions from '@/pages/predictions';
import Settings from '@/pages/settings';
import NotFound from '@/pages/not-found';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = typeof error === "object" && error && "status" in error
          ? Number((error as { status: number }).status)
          : 0;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    if (location !== "/") {
      return <LandingPage />; // Or redirect to / which renders LandingPage if not logged in
    }
    return <LandingPage />;
  }

  return <Component />;
}

function Router() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[100dvh] bg-background w-full">
      <Sidebar />
      <main className="flex-1 w-full overflow-y-auto">
        <div className="px-4 py-6 md:px-8 md:py-8 min-h-full">
          <Switch>
            <Route path="/">
              {user ? <Dashboard /> : <LandingPage />}
            </Route>
            <Route path="/events">
              <ProtectedRoute component={EventsHistory} />
            </Route>
            <Route path="/events/:id">
              <ProtectedRoute component={EventWorkflow} />
            </Route>
            <Route path="/predictions">
              <ProtectedRoute component={Predictions} />
            </Route>
            <Route path="/settings">
              <ProtectedRoute component={Settings} />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <RoutedErrorBoundary>
              <Router />
            </RoutedErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
