import '@vly-ai/integrations';
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { initAudioUnlock } from "@/lib/sounds";
import { initTheme } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const AdminPage = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Unlock the audio context on the first user interaction so call ringtones
// and message dings can play (browsers block audio until a gesture).
initAudioUnlock();

// Apply the saved/system color theme before the first paint.
initTheme();

// Some projects are imported with a stale VITE_CONVEX_URL pointing at an old
// deployment that no longer hosts this app's functions (every mutation/action
// there fails with a bare "Server Error"). Probe the configured deployment
// once and fall back to the platform's live dev deployment when it's stale.
const FALLBACK_CONVEX_URL = "https://adjoining-hummingbird-294.convex.cloud";
const CONVEX_URL_KEY = "freecall-convex-url";
const CONVEX_URL_AT_KEY = "freecall-convex-url-at";
const CONVEX_URL_CACHE_MS = 10 * 60 * 1000;

async function probeDeployment(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Convex-Client": "web-js@1.43.0",
      },
      body: JSON.stringify({
        path: "admin:login",
        format: "convex_encoded_json",
        args: [{ username: "health", password: "check" }],
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      status?: string;
      errorMessage?: string;
    };
    // Healthy deployments reply with a detailed error ("Invalid admin
    // credentials"). A bare "Server Error" means the deployment is stale and
    // no longer running this app's code.
    if (data.status === "success") return true;
    const msg = data.errorMessage ?? "";
    return msg.includes("Invalid admin credentials") || msg.includes("Uncaught");
  } catch {
    return false;
  }
}

async function resolveConvexUrl(): Promise<string> {
  const configured = (import.meta.env.VITE_CONVEX_URL as string) ?? "";
  if (!configured) return FALLBACK_CONVEX_URL;
  if (configured === FALLBACK_CONVEX_URL) return configured;
  // Reuse a recent decision so we don't probe on every page load, but re-check
  // periodically in case the platform fixed the configured URL.
  try {
    const cached = window.localStorage.getItem(CONVEX_URL_KEY);
    const cachedAt = Number(
      window.localStorage.getItem(CONVEX_URL_AT_KEY) ?? 0,
    );
    if (cached && Date.now() - cachedAt < CONVEX_URL_CACHE_MS) return cached;
  } catch {
    /* storage unavailable — probe below */
  }
  const healthy = await probeDeployment(configured);
  const url = healthy ? configured : FALLBACK_CONVEX_URL;
  try {
    window.localStorage.setItem(CONVEX_URL_KEY, url);
    window.localStorage.setItem(CONVEX_URL_AT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — probe next load */
  }
  return url;
}

// Register the service worker in production builds only (PWA install prompt +
// offline support). Kept out of the dev preview so HMR is never cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


async function bootstrap() {
  const convexUrl = await resolveConvexUrl();
  const convex = new ConvexReactClient(convexUrl);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RootErrorBoundary>
        <ToolbarErrorBoundary>
          <VlyToolbar />
        </ToolbarErrorBoundary>
        <ConvexAuthProvider client={convex}>
          <BrowserRouter>
            <RouteSyncer />
            <NotificationWatcher />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/auth"
                  element={<AuthPage redirectAfterAuth="/dashboard" />}
                />
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <Dashboard />
                    </RequireAuth>
                  }
                />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </ConvexAuthProvider>
      </RootErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
