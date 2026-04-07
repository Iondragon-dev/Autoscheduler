import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, AlertCircle, ArrowRight, Eye, EyeOff, CheckCircle2, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

export default function TeacherSignup() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function slugify(str: string) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManuallyEdited) {
      setSlug(slugify(val));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Full name is required."); return; }
    if (!slug.trim()) { setError("URL name is required."); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { setError("URL name can only contain lowercase letters, numbers, and hyphens."); return; }
    if (!passcode.trim()) { setError("Passcode is required."); return; }
    if (passcode.length < 4) { setError("Passcode must be at least 4 characters."); return; }
    if (passcode !== confirmPasscode) { setError("Passcodes don't match."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), passcode, subject: subject.trim() || undefined, email: email.trim() || undefined }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Failed to create account. Please try again.");
      } else {
        setSuccess(true);
        setTimeout(() => navigate("/teacher"), 2500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-8"
        >
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-display font-bold text-foreground mb-2">Account Created!</h2>
                <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
              </motion.div>
            ) : (
              <motion.div key="form">
                <div className="flex flex-col items-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <GraduationCap className="w-7 h-7 text-primary" />
                  </div>
                  <h1 className="text-2xl font-display font-bold text-foreground text-center">Create Teacher Account</h1>
                  <p className="text-sm text-muted-foreground text-center mt-1">Set up your personal booking page.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Full Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="Ms. Smith"
                      value={name}
                      onChange={e => handleNameChange(e.target.value)}
                      autoFocus
                      maxLength={60}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      URL Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="ms-smith"
                      value={slug}
                      onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setSlugManuallyEdited(true); }}
                      maxLength={40}
                    />
                    {slug && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Students will book at: <span className="font-mono text-primary">/book/{slug}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Subject (optional)
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Math, Science, Music"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      maxLength={60}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Recovery Email (optional)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="pl-9"
                        autoComplete="email"
                        maxLength={254}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Used if you ever need to recover your passcode.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Passcode <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showPasscode ? "text" : "password"}
                        placeholder="At least 4 characters"
                        value={passcode}
                        onChange={e => setPasscode(e.target.value)}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPasscode(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Confirm Passcode <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type={showPasscode ? "text" : "password"}
                      placeholder="Repeat passcode"
                      value={confirmPasscode}
                      onChange={e => setConfirmPasscode(e.target.value)}
                      autoComplete="new-password"
                    />
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

                  <Button type="submit" className="w-full mt-1" isLoading={loading}>
                    Create Account
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="text-center mt-5 space-y-1.5">
          <div>
            <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
              Already have an account? Sign in →
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
