import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, AlertCircle, ArrowRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export const SESSION_KEY = "teacherAuth";

async function verifyPasscode(passcode: string): Promise<boolean> {
  const res = await fetch("/api/auth/teacher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
  return res.ok;
}

const DEFAULT_PASSCODE_HINT = "teacher123";

async function resetPasscode(): Promise<void> {
  await fetch("/api/auth/teacher/passcode/reset", { method: "POST" });
}

/** Call this to immediately sign out of the teacher area. */
export function signOutTeacher() {
  sessionStorage.removeItem(SESSION_KEY);
}

export default function TeacherGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode) return;
    setLoading(true);
    setError("");

    const ok = await verifyPasscode(passcode);
    setLoading(false);

    if (ok) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
    } else {
      setError("Incorrect passcode. Please try again.");
      setShake(true);
      setPasscode("");
      setTimeout(() => setShake(false), 600);
    }
  }

  async function handleReset() {
    setResetting(true);
    await resetPasscode();
    setResetting(false);
    setResetDone(DEFAULT_PASSCODE_HINT);
    setShowReset(false);
    setPasscode(DEFAULT_PASSCODE_HINT);
    setError("");
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

          <h1 className="text-2xl font-display font-bold text-foreground mb-1">Teacher Area</h1>
          <p className="text-sm text-muted-foreground mb-7">Enter the passcode to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="relative">
              <Input
                type={showPasscode ? "text" : "password"}
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoFocus
                className="pr-10"
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

            <AnimatePresence>
              {resetDone && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm font-medium text-green-600 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  Passcode reset to <span className="font-mono font-bold">{resetDone}</span>. You can log in now.
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" className="w-full" isLoading={loading}>
              Enter
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          {/* Forgot passcode */}
          <div className="mt-5">
            <AnimatePresence mode="wait">
              {!showReset ? (
                <motion.button
                  key="link"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Forgot passcode?
                </motion.button>
              ) : (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-3"
                >
                  <p className="text-xs text-amber-800 font-medium">
                    This will reset your passcode back to the default. You can then log in and set a new one.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs h-8"
                      onClick={() => setShowReset(false)}
                      disabled={resetting}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white border-0"
                      onClick={handleReset}
                      isLoading={resetting}
                    >
                      Reset passcode
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="text-center mt-5">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            ← Back to booking
          </Link>
        </div>
      </div>
    </div>
  );
}
