import { motion } from "framer-motion";
import { ArrowRight, Compass } from "lucide-react";
import { Link } from "react-router";
import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="app-bg min-h-screen flex flex-col"
    >
      <AppBackground />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="glass-strong flex w-full max-w-md flex-col items-center rounded-[2rem] px-8 py-12 text-center">
          <div className="btn-gradient flex size-16 items-center justify-center rounded-3xl text-white shadow-lg">
            <Compass className="size-8" />
          </div>
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-slate-900">
            404
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This page drifted out of the conversation.
          </p>
          <Button
            asChild
            className="btn-gradient mt-8 rounded-full px-7 text-white shadow-lg"
          >
            <Link to="/">
              Back to home
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
