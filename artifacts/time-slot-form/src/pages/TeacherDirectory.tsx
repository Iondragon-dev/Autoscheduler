import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ArrowRight, Lock, Search, User, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Teacher = { id: number; name: string; slug: string; subject: string | null };

export default function TeacherDirectory() {
  const [, navigate] = useLocation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/teachers`)
      .then(r => r.json())
      .then((data: Teacher[]) => setTeachers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = teachers.filter(t => {
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.subject ?? "").toLowerCase().includes(q) || t.slug.includes(q);
  });

  return (
    <div className="relative min-h-screen flex items-start justify-center py-12 px-4 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-lg mx-auto">
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
            <p className="text-sm text-muted-foreground mt-1">Select your teacher to get started.</p>
          </div>

          <div className="px-6 sm:px-8 pt-5 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search by name or subject…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="px-6 sm:px-8 py-4 min-h-[160px]">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <User className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {query ? "No teachers match your search." : "No teachers have signed up yet."}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                <div className="flex flex-col gap-2">
                  {filtered.map((t, i) => (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, delay: i * 0.04 }}
                      onClick={() => navigate(`/book/${t.slug}`)}
                      className={cn(
                        "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/60",
                        "bg-background/60 hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{t.name}</p>
                          {t.subject && (
                            <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </motion.button>
                  ))}
                </div>
              </AnimatePresence>
            )}
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
