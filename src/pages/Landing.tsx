import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Chrome,
  Download,
  MessageSquareText,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Video,
  Wifi,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router";
import logo from "@/assets/logo.svg";
import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { cn } from "@/lib/utils";

const AUTH_CTA = `/auth?returnTo=${encodeURIComponent("/dashboard")}`;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block size-9 shrink-0 overflow-hidden rounded-xl shadow-lg",
        className,
      )}
    >
      <img
        src={logo}
        alt="Free Call"
        className="size-full object-cover"
        draggable={false}
      />
    </span>
  );
}

/* ---------------------------------- Nav ---------------------------------- */

function Navbar() {
  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl py-2.5 pr-2.5 pl-4">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-slate-800">
              Free Call
            </p>
            <p className="text-[10px] font-medium tracking-wide text-slate-500">
              Voice, video &amp; chat
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="transition-colors hover:text-slate-900">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-slate-900">
            How it works
          </a>
          <a href="#faq" className="transition-colors hover:text-slate-900">
            FAQ
          </a>
          <a href="#download" className="transition-colors hover:text-slate-900">
            Download
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            className="rounded-full text-slate-700 hover:bg-white/70 hover:text-slate-900"
          >
            <Link to={AUTH_CTA}>Sign in</Link>
          </Button>
          <Button asChild className="btn-gradient rounded-full text-white shadow-md">
            <Link to="/dashboard">
              Open app
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

/* ---------------------------------- Hero --------------------------------- */

function HeroMock() {
  return (
    <div className="relative mx-auto mt-14 max-w-4xl">
      {/* floating chips */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="glass-soft absolute -top-5 -left-3 z-10 flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold text-slate-700 sm:left-6"
      >
        <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
        Live presence
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.6 }}
        className="glass-soft absolute -right-3 -bottom-5 z-10 flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold text-slate-700 sm:right-6"
      >
        <Radio className="size-3.5 text-sky-600" />
        Peer-to-peer · no servers
      </motion.div>

      <div className="glass-strong relative overflow-hidden rounded-[2rem] p-3 sm:p-5">
        {/* subtle top sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/50 to-transparent" />

        <div className="grid gap-3 sm:grid-cols-[1fr_1.15fr]">
          {/* fake chat column */}
          <div className="glass flex flex-col rounded-3xl p-4">
            <div className="flex items-center gap-2.5 border-b border-white/60 pb-3">
              <span className="btn-gradient flex size-8 items-center justify-center rounded-full text-[11px] font-bold text-white">
                RA
              </span>
              <div className="leading-tight">
                <p className="text-xs font-bold text-slate-800">Rahim</p>
                <p className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <Wifi className="size-2.5" /> online
                </p>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 py-4">
              <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-white/80 px-3 py-1.5 text-[11px] text-slate-700 shadow-sm">
                Bro, what are we up to tonight? 😄
              </div>
              <div className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500 to-indigo-500 px-3 py-1.5 text-[11px] text-white shadow-sm">
                Let&apos;s do a video call! 🎥
              </div>
              <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-white/80 px-3 py-1.5 text-[11px] text-slate-700 shadow-sm">
                Yes! Let&apos;s start now
              </div>
            </div>
            <div className="glass-soft flex items-center gap-2 rounded-full p-1.5 pl-3">
              <span className="flex-1 text-[10px] text-slate-400">
                Type a message…
              </span>
              <span className="btn-gradient flex size-6 items-center justify-center rounded-full">
                <ArrowRight className="size-3 text-white" />
              </span>
            </div>
          </div>

          {/* fake video call column */}
          <div className="relative flex min-h-[260px] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-sky-400 via-indigo-400 to-violet-400 p-4">
            <div className="pointer-events-none absolute -top-10 -right-8 size-40 rounded-full bg-white/25 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 size-40 rounded-full bg-cyan-300/40 blur-2xl" />

            <div className="relative flex items-center justify-between">
              <div className="glass-strong flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-white">
                <span className="flex size-7 items-center justify-center rounded-full bg-white/30 text-[10px] font-bold">
                  RA
                </span>
                <span className="text-xs font-semibold">Rahim · Video call</span>
              </div>
              <span className="glass-strong rounded-full px-3 py-1.5 text-[11px] font-semibold text-white">
                12:34
              </span>
            </div>

            <div className="relative flex flex-1 items-center justify-center">
              <motion.span
                aria-hidden
                className="absolute size-24 rounded-full border-2 border-white/40"
                animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="flex size-20 items-center justify-center rounded-full bg-white/25 text-2xl font-bold text-white ring-4 ring-white/50 backdrop-blur">
                RA
              </span>
            </div>

            <div className="relative flex items-center justify-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-sky-600 shadow-lg">
                <MicOff className="size-4" />
              </span>
              <span className="flex size-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg">
                <PhoneOff className="size-4" />
              </span>
              <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-sky-600 shadow-lg">
                <Video className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 text-center sm:pt-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto flex max-w-3xl flex-col items-center"
      >
        <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-sky-700">
          <Sparkles className="size-3.5" />
          Free forever · No downloads · No hidden charges
        </span>

        <h1 className="mt-7 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
          Talk to anyone,
          <br />
          <span className="text-gradient-cool">for free.</span>
        </h1>

        <p className="mt-4 text-lg font-medium text-indigo-700/90">
          Free voice calls, video calls and chat — no hassle, no charges.
        </p>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
          Free Call gives you unlimited voice calls, HD video calls and instant
          chat — right in your browser. No app installs, no minutes, no fees.
          Just pick a person and start talking.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="btn-gradient h-12 rounded-full px-8 text-white shadow-lg"
          >
            <Link to={AUTH_CTA}>
              Start calling free
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="glass-soft h-12 rounded-full border-white/80 px-8 text-slate-700 hover:bg-white/70"
          >
            <a href="#how">See how it works</a>
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="size-4 text-emerald-500" /> Unlimited calls
          </span>
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="size-4 text-emerald-500" /> Works in any browser
          </span>
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="size-4 text-emerald-500" /> Private by design
          </span>
        </div>
      </motion.div>

      <HeroMock />
    </section>
  );
}

/* -------------------------------- Features ------------------------------- */

const FEATURES = [
  {
    icon: Video,
    title: "Free video calls",
    body: "Crystal-clear 1:1 video calls that run straight between the two of you. No minutes, no limits, no waiting rooms.",
    accent: "text-sky-600 bg-sky-500/10",
  },
  {
    icon: Phone,
    title: "Voice calls",
    body: "When you just want to talk, start a free voice call with one tap — as long as you like, as often as you like.",
    accent: "text-indigo-600 bg-indigo-500/10",
  },
  {
    icon: MessageSquareText,
    title: "Instant chat",
    body: "Typing is free too. Every chat thread lives alongside your calls, so the conversation never loses the plot.",
    accent: "text-violet-600 bg-violet-500/10",
  },
  {
    icon: Wifi,
    title: "Live presence",
    body: "See who is online and who is already in a call before you ring — no more guessing or awkward interruptions.",
    accent: "text-cyan-600 bg-cyan-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Calls connect peer-to-peer, so your audio and video never pass through a third-party media server.",
    accent: "text-emerald-600 bg-emerald-500/10",
  },
  {
    icon: Zap,
    title: "No setup, no fees",
    body: "Sign in with just an email — or skip straight to guest mode. There are no plans, paywalls or premium tiers.",
    accent: "text-amber-600 bg-amber-500/10",
  },
];

function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-4 py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="glass-soft rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-sky-700">
          Everything included
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          One app for every conversation
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Calls, video and chat in one place — built to be simple enough for
          anyone, free enough for everyone.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={index * 0.06}>
            <div className="glass group h-full rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1">
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-2xl",
                  feature.accent,
                )}
              >
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-800">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {feature.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- How it works ----------------------------- */

const STEPS = [
  {
    number: "01",
    title: "Sign in",
    body: "Enter your email for a one-time code — or skip it entirely and continue as a guest.",
  },
  {
    number: "02",
    title: "Pick someone",
    body: "Browse the People tab, see who is online, and open a chat with a single tap.",
  },
  {
    number: "03",
    title: "Call or chat",
    body: "Hit the phone or video button for a free call, or just start typing. That's it.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-6xl px-4 py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="glass-soft rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-sky-700">
          How it works
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Up and talking in under a minute
        </h2>
      </Reveal>

      <div className="relative mt-12 grid gap-4 md:grid-cols-3">
        <div
          aria-hidden
          className="absolute top-10 right-[16%] left-[16%] hidden border-t-2 border-dashed border-sky-200 md:block"
        />
        {STEPS.map((step, index) => (
          <Reveal key={step.number} delay={index * 0.1}>
            <div className="glass relative h-full rounded-3xl p-6">
              <span className="text-gradient-cool text-4xl font-extrabold">
                {step.number}
              </span>
              <h3 className="mt-3 text-base font-bold text-slate-800">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {step.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- Testimonials ----------------------------- */

const TESTIMONIALS = [
  {
    quote:
      "I call my mother in the village every evening — video, no cost, no cuts. It just works.",
    name: "Shakib",
    role: "Chats & calls daily",
  },
  {
    quote:
      "Finally something that doesn't push me to upgrade every week. Free really means free here.",
    name: "Nusrat",
    role: "University student",
  },
  {
    quote:
      "Set up a call with my brother in 20 seconds from the browser. Zero downloads, zero hassle.",
    name: "Tanvir",
    role: "Works abroad",
  },
];

function Testimonials() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="glass-soft rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-sky-700">
          Loved by real people
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Made for conversations that matter
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((t, index) => (
          <Reveal key={t.name} delay={index * 0.08}>
            <figure className="glass flex h-full flex-col rounded-3xl p-6">
              <div className="flex gap-0.5 text-amber-400" aria-hidden>
                {"★★★★★".split("").map((star, i) => (
                  <span key={i} className="text-sm">
                    {star}
                  </span>
                ))}
              </div>
              <blockquote className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-white/60 pt-4">
                <span className="btn-gradient flex size-9 items-center justify-center rounded-full text-xs font-bold text-white">
                  {t.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-slate-800">{t.name}</p>
                  <p className="text-[11px] text-slate-500">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

const FAQS = [
  {
    q: "Is it really free?",
    a: "Yes — no plans, no minutes, no premium tiers. Calls and chat are free for everyone, forever.",
  },
  {
    q: "Do I need to install anything?",
    a: "No — Free Call runs entirely in your browser. Prefer an app? You can install it to your home screen in a couple of taps, and it keeps working offline.",
  },
  {
    q: "How do video calls connect?",
    a: "Calls connect peer-to-peer between the two of you using WebRTC, so your conversation never travels through a paid media server.",
  },
  {
    q: "Who can I call?",
    a: "Anyone with a Free Call account. Sign in on a second browser or device, and you'll see each other in the People tab.",
  },
];

function Faq() {
  return (
    <section id="faq" className="relative mx-auto max-w-3xl px-4 py-20">
      <Reveal className="text-center">
        <span className="glass-soft rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-sky-700">
          FAQ
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Questions, answered
        </h2>
      </Reveal>

      <div className="mt-10 flex flex-col gap-3">
        {FAQS.map((item, index) => (
          <Reveal key={item.q} delay={index * 0.05}>
            <details className="glass group rounded-2xl px-5 py-4 open:pb-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="glass-soft flex size-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition-transform duration-200 group-open:rotate-45">
                  <span className="text-base leading-none">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-500">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- Download app ----------------------------- */

const INSTALL_STEPS = [
  {
    icon: Smartphone,
    title: "Android",
    body: "Open Free Call in Chrome, tap the ⋮ menu and choose \"Install app\" (or \"Add to Home screen\").",
  },
  {
    icon: Chrome,
    title: "iPhone / iPad",
    body: "Open Free Call in Safari, tap Share, then \"Add to Home Screen\".",
  },
  {
    icon: Monitor,
    title: "Desktop",
    body: "Click the install icon in your browser's address bar — Chrome, Edge and Safari all support it.",
  },
];

function DownloadApp() {
  const { canInstall, install } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section id="download" className="relative mx-auto max-w-6xl px-4 py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="glass-soft rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-sky-700">
          Get the app
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Download Free Call on your phone
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Install it like a native app — one tap from your browser, no app store,
          no fees. Calls and chat stay free forever.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="glass-strong relative mx-auto mt-12 max-w-3xl overflow-hidden rounded-[2rem] p-6 sm:p-10">
          <div className="pointer-events-none absolute -top-20 -right-10 h-48 w-48 rounded-full bg-sky-300/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-indigo-300/40 blur-3xl" />

          <div className="relative flex flex-col items-center text-center">
            {canInstall ? (
              <>
                <span className="btn-gradient flex size-14 items-center justify-center rounded-2xl text-white shadow-lg">
                  <Download className="size-7" />
                </span>
                <h3 className="mt-4 text-xl font-bold text-slate-800">
                  Install the app in one tap
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Adds Free Call to your home screen with its own app icon and
                  window — just like a native app. You&apos;ll get call &amp;
                  message notifications even when the app is closed.
                </p>
                <Button
                  type="button"
                  size="lg"
                  disabled={installing}
                  onClick={() => void handleInstall()}
                  className="btn-gradient mt-6 h-12 rounded-full px-8 text-white shadow-lg"
                >
                  <Download className="size-4" />
                  {installing ? "Installing…" : "Download the app"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  Your browser doesn&apos;t offer a one-tap install here — but
                  it&apos;s still just two taps:
                </p>
                <div className="mt-6 grid w-full gap-4 sm:grid-cols-3">
                  {INSTALL_STEPS.map((step) => (
                    <div
                      key={step.title}
                      className="glass-soft rounded-2xl p-4 text-left"
                    >
                      <span className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                        <step.icon className="size-4" />
                      </span>
                      <p className="mt-2.5 text-xs font-bold text-slate-800">
                        {step.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        {step.body}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  Works offline once installed — calls and chat stay free.
                </p>
              </>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ Final CTA band ---------------------------- */

function FinalCta() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20">
      <Reveal>
        <div className="glass-strong relative overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-300/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-indigo-300/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 -bottom-24 h-56 w-56 rounded-full bg-cyan-200/50 blur-3xl" />

          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Your next conversation is{" "}
              <span className="text-gradient-cool">one click away</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              Join Free Call today and start making free calls, video calls and
              chats — zero hassle, forever free.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="btn-gradient h-12 rounded-full px-8 text-white shadow-lg"
              >
                <Link to={AUTH_CTA}>
                  Create your free account
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="glass-soft h-12 rounded-full border-white/80 px-8 text-slate-700 hover:bg-white/70"
              >
                <Link to="/dashboard">Open the app</Link>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* --------------------------------- Footer -------------------------------- */

function Footer() {
  return (
    <footer className="relative border-t border-white/60 bg-white/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8 rounded-lg" />
          <p className="text-sm font-bold text-slate-800">Free Call</p>
          <p className="text-xs text-slate-500">
            Free voice calls, video calls &amp; chat.
          </p>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <a href="#features" className="transition-colors hover:text-slate-800">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-slate-800">
            How it works
          </a>
          <a
            href="https://freebuff.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-slate-800"
          >
            Built with freebuff
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="app-bg min-h-screen text-foreground"
    >
      <AppBackground />
      <Navbar />
      <main className="relative">
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Faq />
        <DownloadApp />
        <FinalCta />
      </main>
      <Footer />
    </motion.div>
  );
}
