import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight, UserPlus, Lock, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface TeacherEntry {
  id: number;
  name: string;
  slug: string;
  subject: string | null;
}

export default function TeacherDirectory() {
  const [teachers, setTeachers] = useState<TeacherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/teachers")
      .then(r => r.json())
      .then((data: TeacherEntry[]) => setTeachers(data))
      .catch(() => setError("Failed to load teachers. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

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
                <h1 className="text-xl font-bold text-foreground leading-tight">Choose Your Teacher</h1>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Select a teacher below to book a session with them.
            </p>
          </div>

          <div className="px-6 sm:px-8 py-6">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            ) : teachers.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm space-y-3">
                <p>No teachers have set up their booking yet.</p>
                <Link href="/teacher/signup" className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 text-sm font-medium transition-colors">
                  <UserPlus className="w-4 h-4" />
                  Create the first teacher account
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {teachers.map((t, i) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Link href={`/book/${t.slug}`}>
                      <div className="group w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-primary">
                              {t.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm">{t.name}</div>
                            {t.subject && (
                              <div className="text-xs text-muted-foreground mt-0.5">{t.subject}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium">
                            Book now
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
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
