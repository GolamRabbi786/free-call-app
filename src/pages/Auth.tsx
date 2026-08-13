import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import logo from "@/assets/logo.svg";
import { Link } from "react-router";
import { AppBackground } from "@/components/AppBackground";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Mail,
  MessageSquareText,
  Moon,
  Phone,
  ShieldCheck,
  Smartphone,
  Sun,
  User,
  UserPlus,
  Video,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getTheme, toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Method = "phone" | "email";
type Mode = "login" | "signup";
type EmailStep = "input" | "code";

/**
 * The auth library wraps server errors in a noisy envelope like
 * "[CONVEX A(auth:signIn)] [Request ID: ...] Server Error
 *  Uncaught Error: InvalidSecret\n    at ...". Pull out just the real message
 * so the UI shows something readable.
 */
function friendlyAuthError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";
  // Envelope with "Called by client" (client-side validation errors).
  const calledByClient = raw.match(/\](.*?)Called by client/);
  if (calledByClient?.[1]) {
    const inner = calledByClient[1].trim();
    // Strip the "[Request ID: ...] Server Error" prefix if nothing followed it.
    const uncaught = inner.match(/(?:Uncaught Error:\s*)+([^\n]+)/);
    if (uncaught?.[1]) return uncaught[1].trim();
    const stripped = inner.split("\n")[0].replace(/^\[Request ID: [^\]]*\]\s*/, "").trim();
    if (stripped && stripped !== "Server Error") return stripped;
  }
  // Envelope with "Uncaught Error: ..." (server-side thrown errors).
  const uncaught = raw.match(/(?:Uncaught Error:\s*)+([^\n]+)/);
  if (uncaught?.[1]) return uncaught[1].trim();
  const stripped = raw.split("\n")[0].trim();
  if (stripped && stripped !== "Server Error") return stripped;
  return "Something went wrong. Please try again.";
}

function BrandPanel() {
  return (
    <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden rounded-[2rem] border border-white/50 bg-white/30 p-10 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl lg:flex dark:border-white/10 dark:bg-white/5">
      <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-sky-300/50 blur-3xl dark:bg-sky-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-10 size-80 rounded-full bg-indigo-300/50 blur-3xl dark:bg-indigo-500/20" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="size-12 overflow-hidden rounded-2xl shadow-lg">
            <img
              src={logo}
              alt="Free Call"
              className="size-full object-cover"
              draggable={false}
            />
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Free Call
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Calls, video &amp; chat — free forever
            </p>
          </div>
        </div>

        <h2 className="mt-10 max-w-md text-4xl leading-tight font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Talk to anyone,{" "}
          <span className="text-gradient-cool">anywhere in the world</span>
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
          Free voice calls, HD video calls, group chats and voice messages —
          no setup, no limits. Just your phone number and you're in.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {[
            { icon: Phone, title: "Free voice calls", sub: "Crystal-clear audio, no minutes" },
            { icon: Video, title: "HD video calls", sub: "Face to face with anyone" },
            { icon: MessageSquareText, title: "Chat & voice notes", sub: "Text, photos, voice messages" },
          ].map((f) => (
            <div
              key={f.title}
              className="glass-soft flex items-center gap-3 rounded-2xl px-4 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
                <f.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {f.title}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {f.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="relative mt-10 text-[11px] text-slate-400 dark:text-slate-500">
        Sign in with your phone number and password — no verification codes, no
        waiting. Email login also available.
      </p>
    </div>
  );
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const convex = useConvex();

  const [method, setMethod] = useState<Method>("phone");
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+880");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("input");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleThemeToggle = () => {
    setTheme(toggleTheme());
  };

  const fullPhone = () => {
    let digits = phone.replace(/\D/g, "");
    const code = countryCode.replace(/\D/g, "");
    // With a country code selected, drop the local trunk prefix "0" so
    // +880 + 01903162833 becomes +8801903162833 (valid E.164).
    if (code && digits.startsWith("0")) {
      digits = digits.replace(/^0+/, "");
    }
    return `+${code}${digits}`;
  };

  const switchMethod = (next: Method) => {
    setMethod(next);
    setError(null);
    setEmailStep("input");
    setOtp("");
    setDevCode(null);
  };

  const switchToLogin = (message: string) => {
    setMode("login");
    setError(message);
  };

  /* ---------------- Phone: password login / signup ---------------- */

  const handlePhoneSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        flow: mode === "signup" ? "signUp" : "signIn",
        password,
      };
      params.phone = fullPhone();
      if (mode === "signup" && name.trim()) {
        params.name = name.trim();
      }
      await signIn("phone-password", params);
      // Signed in — the useEffect above navigates to `redirect`.
    } catch (rawError) {
      console.error("Sign-in error:", rawError);
      const message = friendlyAuthError(rawError);
      if (message.includes("already exists")) {
        switchToLogin(
          "This number is already registered — sign in below with your password.",
        );
      } else if (
        message.includes("InvalidSecret") ||
        message.includes("InvalidAccountId") ||
        message.toLowerCase().includes("invalid credentials")
      ) {
        setError("Wrong number or password. Check and try again.");
      } else if (message.includes("TooManyFailedAttempts")) {
        setError("Too many failed attempts. Try again in a few minutes.");
      } else {
        setError(message);
      }
      setIsLoading(false);
    }
  };

  /* ---------------- Email: OTP code flow ---------------- */

  const handleEmailSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setIsLoading(true);
    setError(null);
    setDevCode(null);
    try {
      await signIn("email-otp", { email: normalized });
      setEmailStep("code");
      setOtp("");
      // Dev fallback: when no email service is configured the code is stored in
      // devCodes — fetch it so the user can still sign in.
      try {
        const dev = await convex.query(api.auth.devCodes.get, {
          identifier: normalized,
        });
        if (dev) setDevCode(dev.code);
      } catch {
        // Real email was sent — ignore.
      }
    } catch (rawError) {
      console.error("Email send error:", rawError);
      setError(friendlyAuthError(rawError));
    }
    setIsLoading(false);
  };

  const handleEmailVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email: normalized, code: otp });
      // Signed in — clean up the dev-mode code if one was shown.
      void convex
        .mutation(api.auth.devCodes.clear, { identifier: normalized })
        .catch(() => {});
    } catch (rawError) {
      console.error("Email verify error:", rawError);
      setError("The code you entered is incorrect or expired.");
      setOtp("");
    }
    setIsLoading(false);
  };

  const backToEmailInput = () => {
    setEmailStep("input");
    setOtp("");
    setError(null);
    setDevCode(null);
  };

  const isPhone = method === "phone";
  const isSignup = mode === "signup";

  const title = isPhone
    ? isSignup
      ? "Create your account"
      : "Welcome back"
    : emailStep === "code"
      ? "Enter the code"
      : "Sign in with email";

  const description = isPhone
    ? isSignup
      ? "Your number + a password — no OTP needed"
      : "Sign in with your number + password"
    : emailStep === "code"
      ? `We sent a 6-digit code to ${email.trim().toLowerCase()}`
      : "We'll email you a code — no password needed";

  return (
    <div className="app-bg min-h-screen flex flex-col">
      <AppBackground />

      {/* top bar */}
      <div className="relative flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="size-9 overflow-hidden rounded-xl shadow-md">
            <img
              src={logo}
              alt="Free Call"
              className="size-full object-cover"
              draggable={false}
            />
          </div>
          <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Free Call
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="glass-soft rounded-full text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
          onClick={handleThemeToggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>

      {/* content */}
      <div className="relative flex flex-1 items-center justify-center px-4 pb-10">
        <div className="flex w-full max-w-5xl items-stretch justify-center gap-6">
          <BrandPanel />

          <div className="flex w-full max-w-md flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <Card className="glass-strong w-full overflow-hidden rounded-[2rem] border-white/70 pb-0 shadow-none">
                <CardHeader className="text-center">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                    {isPhone ? (
                      isSignup ? (
                        <UserPlus className="size-7" />
                      ) : (
                        <LogIn className="size-7" />
                      )
                    ) : emailStep === "code" ? (
                      <ShieldCheck className="size-7" />
                    ) : (
                      <Mail className="size-7" />
                    )}
                  </div>
                  <CardTitle className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">
                    {description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-6 pb-6 sm:px-8">
                  {/* method switcher */}
                  <div className="glass-soft mb-5 grid grid-cols-2 gap-1 rounded-2xl p-1">
                    {(
                      [
                        { id: "phone", label: "Phone", icon: Smartphone },
                        { id: "email", label: "Email", icon: Mail },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => switchMethod(m.id)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                          method === m.id
                            ? "bg-white/85 text-slate-900 shadow-sm dark:bg-slate-700/80 dark:text-white"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                        )}
                      >
                        <m.icon className="size-4" />
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {isPhone ? (
                    <>
                      {/* login / signup switcher (phone only) */}
                      <div className="glass-soft mb-5 grid grid-cols-2 gap-1 rounded-2xl p-1">
                        {(
                          [
                            { id: "login", label: "Login", icon: LogIn },
                            { id: "signup", label: "Create account", icon: UserPlus },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setMode(m.id);
                              setError(null);
                            }}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                              mode === m.id
                                ? "bg-white/85 text-slate-900 shadow-sm dark:bg-slate-700/80 dark:text-white"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                            )}
                          >
                            <m.icon className="size-4" />
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
                        {isSignup && (
                          <div className="relative">
                            <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                            <Input
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Your name"
                              className="glass-soft h-12 rounded-xl border-white/70 pl-10"
                              disabled={isLoading}
                              maxLength={40}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div className="glass-soft flex items-center gap-1 rounded-xl border border-white/70 px-3 py-2.5">
                            <span className="text-sm">🇧🇩</span>
                            <Input
                              value={countryCode}
                              onChange={(e) =>
                                setCountryCode(
                                  "+" + e.target.value.replace(/[^\d]/g, ""),
                                )
                              }
                              className="h-auto w-14 border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0 dark:text-slate-100"
                              aria-label="Country code"
                            />
                          </div>
                          <Input
                            value={phone}
                            onChange={(e) =>
                              setPhone(e.target.value.replace(/[^\d]/g, ""))
                            }
                            placeholder="1XXXXXXXXX"
                            inputMode="tel"
                            className="glass-soft h-12 flex-1 rounded-xl border-white/70 pl-4 text-base tracking-wide"
                            disabled={isLoading}
                            required
                            maxLength={15}
                          />
                        </div>

                        <div className="relative">
                          <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                          <Input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isSignup ? "Create a password (6+ characters)" : "Your password"}
                            type={showPassword ? "text" : "password"}
                            className="glass-soft h-12 rounded-xl border-white/70 pl-10 pr-12"
                            disabled={isLoading}
                            required
                            minLength={6}
                            autoComplete={isSignup ? "new-password" : "current-password"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                            title={showPassword ? "Hide password" : "Show password"}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>

                        {error && (
                          <p className="text-sm text-rose-500 dark:text-rose-400">
                            {error}
                          </p>
                        )}

                        <Button
                          type="submit"
                          className="btn-gradient h-12 w-full rounded-full text-white shadow-md"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isSignup ? (
                            <UserPlus className="size-4" />
                          ) : (
                            <ArrowRight className="size-4" />
                          )}
                          {isLoading
                            ? "Please wait…"
                            : isSignup
                              ? "Create account"
                              : "Login"}
                        </Button>

                        <p className="mt-2 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                          {isSignup
                            ? "Your password is stored securely — hashed, never in plain text."
                            : "Use the same number and password every time — no codes to wait for."}
                        </p>
                      </form>
                    </>
                  ) : emailStep === "input" ? (
                    <>
                      <form onSubmit={handleEmailSendCode} className="flex flex-col gap-3">
                        <div className="relative">
                          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                          <Input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            type="email"
                            className="glass-soft h-12 rounded-xl border-white/70 pl-10"
                            disabled={isLoading}
                            required
                          />
                        </div>

                        {error && (
                          <p className="text-sm text-rose-500 dark:text-rose-400">
                            {error}
                          </p>
                        )}

                        <Button
                          type="submit"
                          className="btn-gradient h-12 w-full rounded-full text-white shadow-md"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowRight className="size-4" />
                          )}
                          {isLoading ? "Sending code…" : "Send code"}
                        </Button>

                        <p className="mt-2 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                          First time? Your account opens automatically when the
                          code is verified.
                        </p>
                      </form>
                    </>
                  ) : (
                    <form onSubmit={handleEmailVerify}>
                      <input type="hidden" name="email" value={email.trim().toLowerCase()} />
                      <div className="flex justify-center">
                        <InputOTP
                          value={otp}
                          onChange={setOtp}
                          maxLength={6}
                          disabled={isLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                              const form = (e.target as HTMLElement).closest("form");
                              if (form) form.requestSubmit();
                            }
                          }}
                        >
                          <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot
                                key={index}
                                index={index}
                                className="dark:text-slate-50"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      {devCode && (
                        <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-center text-xs font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                          Email service not configured yet — dev code:{" "}
                          <span className="font-mono text-base font-bold tracking-[0.3em]">
                            {devCode}
                          </span>
                        </div>
                      )}

                      {error && (
                        <p className="mt-3 text-center text-sm text-rose-500 dark:text-rose-400">
                          {error}
                        </p>
                      )}

                      <Button
                        type="submit"
                        className="btn-gradient mt-5 h-12 w-full rounded-full text-white shadow-md"
                        disabled={isLoading || otp.length !== 6}
                      >
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="size-4" />
                        )}
                        {isLoading ? "Verifying…" : "Verify & sign in"}
                      </Button>

                      <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                        Didn't get it?{" "}
                        <button
                          type="button"
                          className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                          onClick={backToEmailInput}
                        >
                          Try again
                        </button>
                      </div>
                    </form>
                  )}
                </CardContent>

                <div className="glass-soft flex items-center justify-center gap-2 border-t border-white/60 px-6 py-3.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <span>
                    Secured by{" "}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Golam Rabbi Engineer
                    </span>
                  </span>
                  <span aria-hidden>·</span>
                  <Link
                    to="/admin"
                    className="flex items-center gap-1 underline hover:text-primary transition-colors"
                  >
                    <ShieldCheck className="size-3" />
                    Admin panel
                  </Link>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
