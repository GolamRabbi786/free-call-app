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
import logo from "@/assets/logo.svg";
import { Link } from "react-router";
import { AppBackground } from "@/components/AppBackground";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  MessageSquareText,
  Moon,
  Phone,
  ShieldCheck,
  Smartphone,
  Sun,
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
type Step = "input" | { method: Method; identifier: string };

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
        Sign in with your phone number — a 6-digit code is sent by SMS. No
        password to remember, ever.
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

  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("input");
  const [countryCode, setCountryCode] = useState("+880");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
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
    const digits = phone.replace(/\D/g, "");
    const code = countryCode.replace(/\D/g, "");
    return `+${code}${digits}`;
  };

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (method === "phone") {
        await signIn("phone-otp", { phone: fullPhone() });
        setStep({ method: "phone", identifier: fullPhone() });
      } else {
        const formData = new FormData(event.currentTarget);
        await signIn("email-otp", formData);
        setStep({ method: "email", identifier: formData.get("email") as string });
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Could not send the code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (step !== "input" && step.method === "phone") {
        await signIn("phone-otp", { phone: step.identifier, code: otp });
      } else {
        const formData = new FormData(event.currentTarget);
        await signIn("email-otp", formData);
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The code you entered is incorrect or expired.");
      setIsLoading(false);
      setOtp("");
      return;
    }
    // Signed in — the useEffect above navigates to `redirect`.
  };

  const backToInput = () => {
    setStep("input");
    setOtp("");
    setError(null);
  };

  const isPhoneStep = step !== "input" && step.method === "phone";

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
                {step === "input" ? (
                  <>
                    <CardHeader className="text-center">
                      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                        {method === "phone" ? (
                          <Smartphone className="size-7" />
                        ) : (
                          <Mail className="size-7" />
                        )}
                      </div>
                      <CardTitle className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-50">
                        {method === "phone"
                          ? "Sign in with your phone"
                          : "Sign in with email"}
                      </CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400">
                        We'll text you a code — no password needed
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
                            onClick={() => {
                              setMethod(m.id);
                              setError(null);
                            }}
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

                      <form onSubmit={handleSendCode} className="flex flex-col gap-3">
                        {method === "phone" ? (
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
                        ) : (
                          <Input
                            name="email"
                            placeholder="name@example.com"
                            type="email"
                            className="glass-soft h-12 rounded-xl border-white/70 pl-4"
                            disabled={isLoading}
                            required
                          />
                        )}

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
                          {isLoading
                            ? "Sending code…"
                            : method === "phone"
                              ? "Send code"
                              : "Send code"}
                        </Button>
                      </form>

                      <p className="mt-4 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                        By continuing you agree to our terms. Standard SMS
                        rates may apply for the verification text.
                      </p>
                    </CardContent>
                  </>
                ) : (
                  <>
                    <CardHeader className="text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 left-3 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                        onClick={backToInput}
                        title="Go back"
                        aria-label="Go back"
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="size-6" />
                      </div>
                      <CardTitle className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-50">
                        Enter the code
                      </CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400">
                        We sent a 6-digit code to{" "}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {step.identifier}
                        </span>
                      </CardDescription>
                    </CardHeader>

                    <form onSubmit={handleVerify}>
                      <CardContent className="px-6 pb-6 sm:px-8">
                        <input
                          type="hidden"
                          name={isPhoneStep ? "phone" : "email"}
                          value={step.identifier}
                        />
                        {!isPhoneStep && <input type="hidden" name="code" value={otp} />}

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
                            onClick={backToInput}
                          >
                            Try again
                          </button>
                        </div>
                      </CardContent>
                    </form>
                  </>
                )}

                <div className="glass-soft flex items-center justify-center gap-2 border-t border-white/60 px-6 py-3.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <span>
                    Secured by{" "}
                    <a
                      href="https://freebuff.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary transition-colors"
                    >
                      freebuff.com
                    </a>
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
