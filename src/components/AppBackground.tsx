/**
 * Fixed full-screen background for the light glassmorphism theme: a bright
 * cool gradient base plus soft color blobs that the translucent panels blur.
 */
export function AppBackground() {
  return (
    <div
      aria-hidden
      className="app-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-sky-300/50 blur-3xl" />
      <div className="absolute top-1/4 -left-44 h-[32rem] w-[32rem] rounded-full bg-indigo-300/45 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-200/50 blur-3xl" />
      <div className="absolute top-1/2 right-1/4 h-80 w-80 rounded-full bg-violet-200/45 blur-3xl" />
      <div className="absolute top-[12%] left-[45%] h-64 w-64 rounded-full bg-sky-200/40 blur-3xl" />
    </div>
  );
}
