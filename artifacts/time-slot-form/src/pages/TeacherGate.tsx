import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, AlertCircle, ArrowRight, Eye, EyeOff, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export const SESSION_KEY = "teacherAuth";

export interface TeacherInfo {
  id: number;
  name: string;
  slug: string;
  subject: string | null;
}

export function getTeacherInfo(): TeacherInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeacherInfo;
  } catch {
    return null;
  }
}

export function signOutTeacher() {
  sessionStorage.removeItem(SESSION_KEY);
  fetch("/api/auth/teacher/logout", { method: "POST", credentials: "include" }).catch(() => {});
}

export default function TeacherGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authed, setAuthed] = useState<boolean>(() => getTeacherInfo() !== null);
  const [slug, setSlug] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !passcode) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/teacher", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), passcode }),
      });
      if (res.ok) {
        const info = await res.json() as TeacherInfo;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
        queryClient.clear();
        setAuthed(true);
      } else {
        const data = await res.json().catch(() => ({})) as { message?: string };
        setError(data.message ?? "Incorrect details. Please try again.");
        setShake(true);
        setPasscode("");
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setError("Network error. Please try again.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  }

  if (authed) return <>{children}</>;

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-sm">
        <motion.div
          animate={shake ? { x: [-12, 12, -10, 10, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-8 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-primary" />
          </div>

          <h1 className="text-2xl font-display font-bold text-foreground mb-1">Teacher Sign In</h1>
          <p className="text-sm text-muted-foreground mb-7">Enter your URL name and passcode to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <Input
              type="text"
              placeholder="URL name (e.g. ms-smith)"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              autoFocus
              autoComplete="username"
              error={!!error}
            />

            <div className="relative">
              <Input
                type={showPasscode ? "text" : "password"}
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="pr-10"
                autoComplete="current-password"
                error={!!error}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPasscode((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm font-medium text-destructive flex items-center gap-1.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" className="w-full" isLoading={loading}>
              Sign In
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>
        </motion.div>

        <div className="text-center mt-5 space-y-2">
          <div>
            <Link href="/teacher/signup" className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              <UserPlus className="w-3.5 h-3.5" />
              Create a new teacher account
            </Link>
          </div>
          <div>
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
              ← Back to directory
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
