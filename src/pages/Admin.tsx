import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
  Activity,
  Archive,
  Ban,
  Download,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Phone,
  ShieldCheck,
  ShieldOff,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTheme, toggleTheme } from "@/lib/theme";
import logo from "@/assets/logo.svg";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";

const TOKEN_KEY = "freecall_admin_token";

// Max chars of base64 per ZIP chunk mutation call (~187 KB each).
const MAX_ZIP_CHUNK = 250_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

type Stats = {
  totalUsers: number;
  newToday: number;
  messagesToday: number;
  callsToday: number;
  users: {
    _id: Id<"users">;
    name?: string;
    email?: string;
    phone?: string;
    image?: string;
    isAnonymous: boolean;
    createdAt: number;
    isOnline: boolean;
    lastSeen: number;
  }[];
  activity: {
    id: string;
    type: "message" | "call";
    text: string;
    at: number;
  }[];
  blocks: {
    _id: Id<"blocks">;
    blockerId: Id<"users">;
    blockerName: string;
    blockedId: Id<"users">;
    blockedName: string;
    createdAt: number;
  }[];
};

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            accent,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
        {value}
      </p>
    </div>
  );
}

function LoginForm({
  onLogin,
  busy,
}: {
  onLogin: (username: string, password: string) => void;
  busy: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <AppBackground />
      <div className="glass-strong relative w-full max-w-sm rounded-3xl border-white/70 dark:border-white/15 p-8 text-center">
        <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-sky-300/40 blur-3xl" />
        <div className="relative">
          <div className="mx-auto size-14 overflow-hidden rounded-2xl shadow-lg">
            <img
              src={logo}
              alt="Free Call"
              className="size-full object-cover"
              draggable={false}
            />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-50">Admin Panel</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sign in to manage Free Call users.
          </p>

          <form
            className="mt-6 flex flex-col gap-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              onLogin(username, password);
            }}
          >
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admin username"
              autoComplete="username"
              className="glass-soft rounded-xl border-white/70 dark:border-white/15"
              required
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="glass-soft rounded-xl border-white/70 dark:border-white/15"
              required
            />
            <Button
              type="submit"
              disabled={busy || !username || !password}
              className="btn-gradient h-11 rounded-full text-white shadow-md"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [loginBusy, setLoginBusy] = useState(false);
  const [confirmUserId, setConfirmUserId] = useState<Id<"users"> | null>(null);

  const login = useMutation(api.admin.login);
  const logout = useMutation(api.admin.logout);
  const removeUser = useMutation(api.admin.removeUser);
  const unblock = useMutation(api.admin.unblock);
  const updateZipStart = useMutation(api.admin.updateProjectZipStart);
  const updateZipChunk = useMutation(api.admin.updateProjectZipChunk);
  const getZipChunk = useMutation(api.admin.getProjectZipChunk);

  const stats = useQuery(api.admin.stats, token ? { token } : "skip");
  const zipMeta = useQuery(api.admin.getProjectZip, token ? { token } : "skip");

  const [uploadingZip, setUploadingZip] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());

  const handleThemeToggle = () => {
    setTheme(toggleTheme());
  };

  const handleZipFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !token) return;
    setUploadingZip(true);
    try {
      const base64 = await fileToBase64(file);
      const chunks: string[] = [];
      for (let i = 0; i < base64.length; i += MAX_ZIP_CHUNK) {
        chunks.push(base64.slice(i, i + MAX_ZIP_CHUNK));
      }
      await updateZipStart({
        token,
        fileName: file.name,
        size: file.size,
        chunkCount: chunks.length,
      });
      for (let i = 0; i < chunks.length; i++) {
        await updateZipChunk({ token, index: i, data: chunks[i] });
      }
      toast.success("Project ZIP stored — only admins can download it");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not store the ZIP",
      );
    } finally {
      setUploadingZip(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  };

  const handleZipDownload = async () => {
    if (!zipMeta || !token) return;
    setDownloadingZip(true);
    try {
      const parts: string[] = [];
      for (let i = 0; i < zipMeta.chunkCount; i++) {
        const data = await getZipChunk({ token, index: i });
        if (data === null) throw new Error("ZIP data is missing — re-upload it");
        parts.push(data);
      }
      const bytes = Uint8Array.from(atob(parts.join("")), (char) =>
        char.charCodeAt(0),
      );
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipMeta.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Download started");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download the ZIP",
      );
    } finally {
      setDownloadingZip(false);
    }
  };

  // Invalid / expired token → back to the login form.
  useEffect(() => {
    if (token && stats === null) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, [token, stats]);

  if (!token) {
    return (
      <LoginForm
        busy={loginBusy}
        onLogin={async (username, password) => {
          setLoginBusy(true);
          try {
            const newToken = await login({ username, password });
            localStorage.setItem(TOKEN_KEY, newToken);
            setToken(newToken);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Sign-in failed",
            );
          } finally {
            setLoginBusy(false);
          }
        }}
      />
    );
  }

  const handleLogout = async () => {
    try {
      await logout({ token });
    } catch {
      /* noop */
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  const handleRemove = async (userId: Id<"users">) => {
    if (confirmUserId !== userId) {
      setConfirmUserId(userId);
      return;
    }
    setConfirmUserId(null);
    try {
      await removeUser({ token, userId });
      toast.success("User removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove user",
      );
    }
  };

  const handleUnblock = async (blockId: Id<"blocks">) => {
    try {
      await unblock({ token, blockId });
      toast.success("Block removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove the block",
      );
    }
  };

  const data = stats;

  return (
    <div className="app-bg min-h-screen text-foreground">
      <AppBackground />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* header */}
        <header className="glass flex items-center justify-between gap-3 rounded-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 overflow-hidden rounded-xl shadow-lg">
              <img
                src={logo}
                alt="Free Call"
                className="size-full object-cover"
                draggable={false}
              />
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">Admin Panel</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Free Call · user control &amp; activity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
              onClick={handleThemeToggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
              onClick={() => navigate("/")}
            >
              View site
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              onClick={() => void handleLogout()}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </header>

        {data === undefined ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-sky-600 dark:text-sky-300" />
          </div>
        ) : data === null ? null : (
          <>
            {/* project ZIP (admin-only download) */}
            <div className="glass mt-5 rounded-3xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Archive className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Project source ZIP
                    </h2>
                    <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                      {zipMeta
                        ? `${zipMeta.fileName} · ${formatBytes(zipMeta.size)}`
                        : "Nothing stored yet — upload the current project ZIP so only admins can download it."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => void handleZipFile(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                    disabled={uploadingZip}
                    onClick={() => zipInputRef.current?.click()}
                  >
                    {uploadingZip ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {uploadingZip
                      ? "Storing…"
                      : zipMeta
                        ? "Replace ZIP"
                        : "Upload ZIP"}
                  </Button>
                  {zipMeta && (
                    <Button
                      type="button"
                      className="btn-gradient rounded-full text-white shadow-md"
                      disabled={downloadingZip}
                      onClick={() => void handleZipDownload()}
                    >
                      {downloadingZip ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      {downloadingZip ? "Preparing…" : "Download ZIP"}
                    </Button>
                  )}
                </div>
              </div>
              {zipMeta && (
                <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                  Stored {format(zipMeta.updatedAt, "MMM d · h:mm a")} · only
                  visible to the admin panel
                </p>
              )}
            </div>

            {/* stat cards */}
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Total users"
                value={data.totalUsers}
                icon={<Users className="size-4 text-sky-600 dark:text-sky-300" />}
                accent="bg-sky-500/10"
              />
              <StatCard
                label="New today"
                value={data.newToday}
                icon={<UserPlus className="size-4 text-emerald-600 dark:text-emerald-400" />}
                accent="bg-emerald-500/10"
              />
              <StatCard
                label="Messages today"
                value={data.messagesToday}
                icon={<MessageSquare className="size-4 text-indigo-600 dark:text-indigo-300" />}
                accent="bg-indigo-500/10"
              />
              <StatCard
                label="Calls today"
                value={data.callsToday}
                icon={<Phone className="size-4 text-violet-600 dark:text-violet-300" />}
                accent="bg-violet-500/10"
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              {/* users */}
              <div className="glass rounded-3xl p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Users</h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {data.users.length} shown · newest first
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {data.users.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      No users yet.
                    </p>
                  ) : (
                    data.users.map((u) => (
                      <div
                        key={u._id}
                        className="flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.07]"
                      >
                        <UserAvatar
                          name={u.name}
                          image={u.image}
                          id={u._id}
                          className="size-9"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {u.name ?? "Guest"}
                            {u.isAnonymous && (
                              <span className="ml-1.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-600 dark:text-sky-300">
                                GUEST
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                            {u.phone ?? u.email ?? "no contact"}
                            {u.phone && u.email ? ` · ${u.email}` : ""} · joined{" "}
                            {format(u.createdAt, "MMM d, yyyy")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 text-[11px]",
                            u.isOnline ? "text-emerald-600" : "text-slate-400",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              u.isOnline ? "bg-emerald-500" : "bg-slate-300",
                            )}
                          />
                          {u.isOnline
                            ? "Online"
                            : `seen ${format(u.lastSeen, "MMM d")}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={cn(
                            "shrink-0 rounded-full",
                            confirmUserId === u._id
                              ? "bg-rose-500 text-white hover:bg-rose-500"
                              : " text-rose-500 dark:text-rose-400 hover:bg-rose-500/10",
                          )}
                          title={
                            confirmUserId === u._id
                              ? "Click again to confirm removal"
                              : "Remove user"
                          }
                          onClick={() => void handleRemove(u._id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
                  Removing a user deletes their account, chats, calls and files
                  permanently.
                </p>
              </div>

              {/* blocked users */}
              <div className="glass rounded-3xl p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Ban className="size-4 text-rose-500 dark:text-rose-400" />
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Blocked users
                  </h2>
                  <span className="ml-auto rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    {data.blocks.length}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {data.blocks.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      No blocks — everyone can chat freely.
                    </p>
                  ) : (
                    data.blocks.map((b) => (
                      <div
                        key={b._id}
                        className="flex items-center gap-2.5 rounded-2xl bg-white/40 px-3 py-2.5 dark:bg-white/[0.06]"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 dark:text-rose-400">
                          <ShieldOff className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs leading-5 text-slate-600 dark:text-slate-300">
                            <span className="font-semibold">{b.blockerName}</span>
                            {" "}blocked{" "}
                            <span className="font-semibold">{b.blockedName}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {format(b.createdAt, "MMM d · h:mm a")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 rounded-full text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
                          title="Remove this block"
                          onClick={() => void handleUnblock(b._id)}
                        >
                          <ShieldOff className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
                  Blocked people can't message or call each other. Admins can
                  lift a block anytime.
                </p>
              </div>

              {/* activity */}
              <div className="glass rounded-3xl p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-sky-600 dark:text-sky-300" />
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Recent activity
                  </h2>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {data.activity.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      Nothing yet — activity shows here as people chat and call.
                    </p>
                  ) : (
                    data.activity.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2.5 rounded-2xl bg-white/40 dark:bg-white/[0.06] px-3 py-2.5"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                            item.type === "call"
                              ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                              : "bg-sky-500/10 text-sky-600 dark:text-sky-300",
                          )}
                        >
                          {item.type === "call" ? (
                            item.text.includes("video") ? (
                              <Video className="size-3.5" />
                            ) : (
                              <Phone className="size-3.5" />
                            )
                          ) : (
                            <MessageSquare className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {item.text}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {format(item.at, "MMM d · h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
