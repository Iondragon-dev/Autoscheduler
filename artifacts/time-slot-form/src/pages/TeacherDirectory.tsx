import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ArrowRight, Lock, AlertCircle, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TeacherDirectory() {
  const [, navigate] = useLocation();
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/teachers/${encodeURIComponent(trimmed)}/timeslots`);
      if (res.ok) {
        navigate(`/book/${trimmed}`);
      } else {
        setError("No teacher found with that username. Please check with your teacher.");
        inputRef.current?.focus();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-start justify-center py-12 px-4 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="flex justify-end mb-3">
          <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Teacher Sign In →
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden"
        >
          <div className="bg-primary/5 border-b border-border/40 px-6 sm:px-8 pt-7 pb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-primary/70 uppercase tracking-widest">Session Booking</p>
                <h1 className="text-xl font-bold text-foreground leading-tight">Book a Session</h1>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your teacher's username to get started.
            </p>
          </div>

          <div className="px-6 sm:px-8 py-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Teacher username
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="e.g. ms-smith"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                      setError("");
                    }}
                    className="pl-9"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    error={!!error}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Your teacher will give you their username.
                </p>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm font-medium text-destructive flex items-start gap-1.5"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                className="w-full"
                isLoading={loading}
                disabled={!slug.trim()}
              >
                Book a Session
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </div>

          <div className="px-6 sm:px-8 pb-6 pt-0 border-t border-border/30">
            <Link href="/teacher/signup">
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
                <Lock className="w-3.5 h-3.5" />
                <span>Are you a teacher?</span>
                <span className="text-primary hover:text-primary/80 font-medium underline underline-offset-2">
                  Create or sign in to your account →
                </span>
              </div>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
