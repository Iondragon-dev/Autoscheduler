import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetTimeSlots,
  useCreateTimeSlot,
  useUpdateTimeSlot,
  useDeleteTimeSlot,
  useGetBookings,
} from "@workspace/api-client-react";
import {
  Clock, Plus, Trash2, ToggleLeft, ToggleRight, Users, ArrowLeft,
  AlertCircle, Calendar, ChevronDown, Mail, User, Sparkles, X,
  Bot, CheckCircle2, ArrowRight, Loader2, KeyRound, Eye, EyeOff, Ban, Upload,
  Wand2, CheckCheck, RotateCcw, TriangleAlert, Pencil, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { signOutTeacher, getTeacherInfo } from "./TeacherGate";
import { fmt12, fmtPriority, toMins, fromMins, generateAllStartTimes } from "@/lib/booking-utils";
import { DURATION_OPTIONS } from "@/lib/booking-constants";
import JSZip from "jszip";

async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (res.status === 401) {
    signOutTeacher();
    window.location.reload();
    throw new Error("Session expired. Please log in again.");
  }
  return res;
}

interface NewSlotForm { day: string; startTime: string; endTime: string; }
interface ParsedSlot { label: string; startTime: string; endTime: string; }
interface ParsedSlotWithDate extends ParsedSlot { dateKey: string; dateLabel: string; weekKey: string; weekLabel: string; }

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

const PRIORITY_COLORS = ["text-amber-500", "text-slate-500", "text-slate-400"];

// ── Change Passcode Dialog ────────────────────────────────────────────────────
function ChangePasscodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent(""); setNext(""); setConfirm("");
    setError(""); setSuccess(false); setLoading(false);
    setShowCurrent(false); setShowNext(false);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 4) { setError("New passcode must be at least 4 characters."); return; }
    if (next !== confirm) { setError("New passcodes don't match."); return; }
    setLoading(true);
    try {
      const res = await adminFetch("/api/auth/teacher/passcode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPasscode: current, newPasscode: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "Failed to update passcode."); }
      else { setSuccess(true); }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold font-display">Change Passcode</h2>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-foreground mb-1">Passcode updated!</p>
                <p className="text-sm text-muted-foreground mb-5">Your new passcode is active.</p>
                <Button onClick={handleClose} className="w-full">Done</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Current Passcode</label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? "text" : "password"}
                      placeholder="Enter current passcode"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      className="pr-10"
                      autoFocus
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowCurrent(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">New Passcode</label>
                  <div className="relative">
                    <Input
                      type={showNext ? "text" : "password"}
                      placeholder="At least 4 characters"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      className="pr-10"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowNext(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Confirm New Passcode</label>
                  <Input
                    type="password"
                    placeholder="Repeat new passcode"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    error={!!(confirm && confirm !== next)}
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />{error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                  <Button type="submit" className="flex-1" isLoading={loading}>Update</Button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() { setConfirm(""); setError(""); setLoading(false); }
  function handleClose() { reset(); onClose(); }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== "DELETE") { setError('Type DELETE (all caps) to confirm.'); return; }
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/teachers/me", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        setError(data.message ?? "Failed to delete account.");
      } else {
        signOutTeacher();
        navigate("/");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <TriangleAlert className="w-4 h-4 text-destructive" />
                </div>
                <h2 className="text-lg font-bold font-display">Delete Account</h2>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-5 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20 text-sm text-destructive space-y-1.5">
              <p className="font-semibold">This action is permanent.</p>
              <p className="text-destructive/80">
                Your account and sign-in access will be removed. Your time slots and student bookings will remain in the system as unlinked records.
              </p>
            </div>

            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  Type <span className="font-mono text-destructive">DELETE</span> to confirm
                </label>
                <Input
                  type="text"
                  placeholder="DELETE"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  autoFocus
                  autoComplete="off"
                  error={!!error}
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                <Button
                  type="submit"
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  isLoading={loading}
                  disabled={confirm !== "DELETE"}
                >
                  Delete Account
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DurationOption = { label: string; value: number };

function DurationOptionsDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: DurationOption[] | null;
  onSave: (opts: DurationOption[] | null) => Promise<void>;
}) {
  const defaultOptions = DURATION_OPTIONS;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [customOptions, setCustomOptions] = useState<DurationOption[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (!initial || initial.length === 0) {
      setSelected(new Set(defaultOptions.map(o => o.value)));
      setCustomOptions([]);
    } else {
      const defaultValues = new Set(defaultOptions.map(o => o.value));
      const sel = new Set<number>();
      const customs: DurationOption[] = [];
      for (const opt of initial) {
        if (defaultValues.has(opt.value)) sel.add(opt.value);
        else customs.push(opt);
      }
      setSelected(sel);
      setCustomOptions(customs);
    }
    setCustomInput("");
    setError("");
    setSaving(false);
  }, [open]);

  const toggleDefault = (value: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const addCustom = () => {
    const mins = parseInt(customInput.trim(), 10);
    if (isNaN(mins) || mins < 1 || mins > 480) {
      setError("Enter a number between 1 and 480.");
      return;
    }
    const allValues = new Set([...Array.from(selected), ...customOptions.map(c => c.value)]);
    if (allValues.has(mins)) {
      setError("That duration is already in the list.");
      return;
    }
    const label = mins >= 60 && mins % 60 === 0 ? `${mins / 60} hr` : `${mins} min`;
    setCustomOptions(prev => [...prev, { label, value: mins }].sort((a, b) => a.value - b.value));
    setCustomInput("");
    setError("");
  };

  const removeCustom = (value: number) => {
    setCustomOptions(prev => prev.filter(o => o.value !== value));
  };

  const handleSave = async () => {
    const combined: DurationOption[] = [
      ...defaultOptions.filter(o => selected.has(o.value)),
      ...customOptions,
    ].sort((a, b) => a.value - b.value);
    const isAllDefaults =
      customOptions.length === 0 &&
      selected.size === defaultOptions.length &&
      defaultOptions.every(o => selected.has(o.value));
    setSaving(true);
    try {
      await onSave(isAllDefaults ? null : combined);
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelected(new Set(defaultOptions.map(o => o.value)));
    setCustomOptions([]);
    setError("");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold font-display">Duration Options</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Choose which session lengths students can select. Changes take effect immediately.
            </p>

            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standard options</p>
              <div className="grid grid-cols-3 gap-2">
                {defaultOptions.map(opt => {
                  const on = selected.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleDefault(opt.value)}
                      className={cn(
                        "py-2 rounded-xl border-2 text-sm font-semibold transition-all",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {customOptions.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom options</p>
                <div className="flex flex-wrap gap-2">
                  {customOptions.map(opt => (
                    <span
                      key={opt.value}
                      className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/30 rounded-full px-3 py-1 text-sm font-semibold"
                    >
                      {opt.label}
                      <button
                        type="button"
                        onClick={() => removeCustom(opt.value)}
                        className="text-primary/60 hover:text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <Input
                type="number"
                min={1}
                max={480}
                placeholder="Custom minutes…"
                value={customInput}
                onChange={e => { setCustomInput(e.target.value); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                className="flex-1 text-sm"
              />
              <Button type="button" variant="outline" onClick={addCustom} className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="text-sm font-medium text-destructive flex items-center gap-1.5 mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 mr-auto self-center"
              >
                Reset to defaults
              </button>
              <Button type="button" variant="outline" onClick={onClose} className="shrink-0">Cancel</Button>
              <Button type="button" onClick={handleSave} isLoading={saving} className="shrink-0">Save</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function parseSlotsFromResponse(text: string): ParsedSlot[] | null {
  const match = text.match(/<TIMESLOTS>([\s\S]*?)<\/TIMESLOTS>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function stripTimeslotBlock(text: string) {
  return text.replace(/<TIMESLOTS>[\s\S]*?<\/TIMESLOTS>/, "").trim();
}

function dayOfSlot(label: string): string {
  for (const d of ALL_DAYS) if (label.startsWith(d)) return d;
  return "Other";
}

// ── RRULE expander ────────────────────────────────────────────────────────────
function expandRRule(
  rrule: string,
  dtStart: Date,
  windowStart: Date,
  windowEnd: Date,
  exDates: Set<string>,
  pad: (n: number) => string
): Date[] {
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parts: Record<string, string> = {};
  rrule.split(";").forEach(p => { const [k, v] = p.split("="); if (k && v) parts[k.trim()] = v.trim(); });

  const freq = parts["FREQ"] ?? "";
  const interval = Math.max(1, parseInt(parts["INTERVAL"] ?? "1"));
  const maxCount = parts["COUNT"] ? parseInt(parts["COUNT"]) : 500;
  const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  let until: Date | null = null;
  if (parts["UNTIL"]) {
    const um = parts["UNTIL"].match(/^(\d{4})(\d{2})(\d{2})/);
    if (um) { until = new Date(+um[1], +um[2] - 1, +um[3]); until.setHours(23, 59, 59, 999); }
  }

  const results: Date[] = [];
  let total = 0;

  const add = (d: Date) => {
    if (!exDates.has(toKey(d)) && d >= windowStart && d <= windowEnd) results.push(new Date(d));
    total++;
  };

  if (freq === "DAILY") {
    let cur = new Date(dtStart);
    while (total < maxCount && cur <= windowEnd) {
      if (until && cur > until) break;
      if (cur >= dtStart) add(cur);
      cur = new Date(cur); cur.setDate(cur.getDate() + interval);
    }
  } else if (freq === "WEEKLY") {
    const byDays = parts["BYDAY"]
      ? parts["BYDAY"].split(",").map(d => d.replace(/[-+\d]/g, "").trim())
      : [Object.entries(DAY_MAP).find(([, v]) => v === dtStart.getDay())?.[0] ?? "MO"];

    // Walk Monday-anchored weeks starting from the dtStart week
    const startDow = dtStart.getDay();
    const toMon = startDow === 0 ? -6 : 1 - startDow;
    let weekMon = new Date(dtStart); weekMon.setDate(dtStart.getDate() + toMon); weekMon.setHours(0, 0, 0, 0);

    let weekCount = 0;
    while (weekCount < 300 && total < maxCount && weekMon <= windowEnd) {
      if (until && weekMon > until) break;
      for (const dayCode of byDays) {
        const dayNum = DAY_MAP[dayCode];
        if (dayNum === undefined) continue;
        const monOffset = dayNum === 0 ? 6 : dayNum - 1;
        const occ = new Date(weekMon); occ.setDate(weekMon.getDate() + monOffset);
        occ.setHours(dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds());
        if (occ < dtStart || (until && occ > until) || total >= maxCount) continue;
        add(occ);
      }
      weekMon = new Date(weekMon); weekMon.setDate(weekMon.getDate() + 7 * interval);
      weekCount++;
    }
  } else if (freq === "MONTHLY") {
    let cur = new Date(dtStart);
    while (total < maxCount && cur <= windowEnd) {
      if (until && cur > until) break;
      if (cur >= dtStart) add(cur);
      cur = new Date(cur); cur.setMonth(cur.getMonth() + interval);
    }
  }

  return results;
}

// ── ICS parser ───────────────────────────────────────────────────────────────
function parseICSToSlots(icsContent: string): ParsedSlotWithDate[] {
  const unfolded = icsContent.replace(/\r?\n[ \t]/g, "");
  const allSlots: ParsedSlotWithDate[] = [];
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Expansion window: 14 days ago → 2 months ahead
  const windowStart = new Date(); windowStart.setDate(windowStart.getDate() - 14); windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(); windowEnd.setMonth(windowEnd.getMonth() + 2); windowEnd.setHours(23, 59, 59, 999);

  const TEACHING_KEYWORDS = [
    "teach", "slot", "lesson", "class", "session", "tutorial",
    "office hours", "tutor", "instruction", "lecture", "seminar",
    "coaching", "training", "workshop",
  ];

  const parseDateTime = (s: string): Date | null => {
    if (/^\d{8}$/.test(s)) return null; // all-day — skip
    const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    const [, yr, mo, dy, hr, min, sec, z] = m;
    return z ? new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +min, +sec))
             : new Date(+yr, +mo - 1, +dy, +hr, +min, +sec);
  };

  for (const block of blocks) {
    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}(?:;[^:\\r\\n]+)?:([^\\r\\n]+)`));
      return m ? m[1].trim() : null;
    };
    const getAll = (key: string): string[] => {
      const re = new RegExp(`${key}(?:;[^:\\r\\n]+)?:([^\\r\\n]+)`, "g");
      const results: string[] = [];
      let m; while ((m = re.exec(block)) !== null) results.push(m[1].trim());
      return results;
    };

    const dtStartRaw = get("DTSTART");
    const dtEndRaw = get("DTEND");
    const summary = get("SUMMARY");
    const rruleRaw = get("RRULE");

    if (!dtStartRaw || !dtEndRaw) continue;

    const dtStart = parseDateTime(dtStartRaw);
    const dtEnd = parseDateTime(dtEndRaw);
    if (!dtStart || !dtEnd) continue;

    const duration = dtEnd.getTime() - dtStart.getTime();

    // Collect all EXDATEs (excluded recurrence instances)
    const exDates = new Set<string>();
    for (const line of getAll("EXDATE")) {
      line.split(",").forEach(ds => { const d = parseDateTime(ds.trim()); if (d) exDates.add(toKey(d)); });
    }

    // Teaching keyword filter
    const summaryLower = (summary ?? "").toLowerCase();
    if (!TEACHING_KEYWORDS.some(kw => summaryLower.includes(kw))) continue;

    // Get all occurrence start dates
    let occurrences: Date[];
    if (rruleRaw) {
      occurrences = expandRRule(rruleRaw, dtStart, windowStart, windowEnd, exDates, pad);
    } else {
      occurrences = (!exDates.has(toKey(dtStart)) && dtStart >= windowStart && dtStart <= windowEnd)
        ? [dtStart] : [];
    }

    for (const occStart of occurrences) {
      const occEnd = new Date(occStart.getTime() + duration);
      const startTime = `${pad(occStart.getHours())}:${pad(occStart.getMinutes())}`;
      const endTime = `${pad(occEnd.getHours())}:${pad(occEnd.getMinutes())}`;
      if (startTime === endTime) continue;

      const dayName = DAY_NAMES[occStart.getDay()];
      const dateKey = toKey(occStart);
      const dateLabel = `${dayName}, ${MONTH_NAMES[occStart.getMonth()]} ${occStart.getDate()}`;

      const dow = occStart.getDay();
      const daysToMon = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(occStart); monday.setDate(occStart.getDate() + daysToMon);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      const weekKey = toKey(monday);
      const weekLabel = `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()} – ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}`;

      const label = summary ?? `${dayName} ${fmt12(startTime)} – ${fmt12(endTime)}`;
      allSlots.push({ label, startTime, endTime, dateKey, dateLabel, weekKey, weekLabel });
    }
  }

  return allSlots;
}

// ── AI Assistant Popup ───────────────────────────────────────────────────────
type WizardStep = "days" | "ics" | "times" | "processing" | "confirm" | "done";
type BlockStep = "input" | "done";
type EditStep = "input" | "done";
type PendingBlock = { slotId: number; slotLabel: string; ranges: { start: string; end: string }[] };
type EditOp =
  | { op: "create"; label: string; startTime: string; endTime: string }
  | { op: "update"; slotId: number; label?: string; startTime?: string; endTime?: string }
  | { op: "delete"; slotId: number };


function isFullyBlocked(startTime: string, endTime: string, blockedTimes: { start: string; end: string }[]): boolean {
  if (!blockedTimes.length) return false;
  const start = toMins(startTime);
  const end = toMins(endTime);
  const sorted = [...blockedTimes].sort((a, b) => toMins(a.start) - toMins(b.start));
  let covered = start;
  for (const bt of sorted) {
    if (toMins(bt.start) > covered) break;
    covered = Math.max(covered, toMins(bt.end));
    if (covered >= end) return true;
  }
  return false;
}

function genTimeOptions(startTime: string, endTime: string, stepMins = 30): string[] {
  const opts: string[] = [];
  for (let t = toMins(startTime); t <= toMins(endTime); t += stepMins) opts.push(fromMins(t));
  return opts;
}

interface AiAssistantProps {
  onSlotsCreated: () => void;
  slots: { id: number; label: string; startTime: string; endTime: string; blockedTimes: { start: string; end: string }[] }[];
}

function AiAssistant({ onSlotsCreated, slots }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "block" | "edit">("create");

  // Create schedule wizard state
  const [step, setStep] = useState<WizardStep>("days");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [dayTimes, setDayTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [aiMessage, setAiMessage] = useState("");
  const [pendingSlots, setPendingSlots] = useState<ParsedSlot[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Edit schedule state
  const [editStep, setEditStep] = useState<EditStep>("input");
  const [editOp, setEditOp] = useState<"add" | "modify" | "remove" | null>(null);
  const [editSelectedSlotId, setEditSelectedSlotId] = useState<number | null>(null);
  const [editAddDay, setEditAddDay] = useState("");
  const [editRangeStart, setEditRangeStart] = useState("");
  const [editRangeEnd, setEditRangeEnd] = useState("");
  const [pendingEdits, setPendingEdits] = useState<EditOp[]>([]);
  const [applyingEdits, setApplyingEdits] = useState(false);

  // Block times state
  const [blockStep, setBlockStep] = useState<BlockStep>("input");
  const [blockSelectedSlotId, setBlockSelectedSlotId] = useState<number | null>(null);
  const [blockRangeStart, setBlockRangeStart] = useState("");
  const [blockRangeEnd, setBlockRangeEnd] = useState("");
  const [pendingBlocks, setPendingBlocks] = useState<PendingBlock[]>([]);
  const [applying, setApplying] = useState(false);

  const [icsError, setIcsError] = useState<string | null>(null);
  const [icsFileName, setIcsFileName] = useState<string | null>(null);
  const [icsParsed, setIcsParsed] = useState<ParsedSlotWithDate[]>([]);
  const [icsSelectedDate, setIcsSelectedDate] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSlot = useCreateTimeSlot();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [showPanelScrollCue, setShowPanelScrollCue] = useState(false);
  const dayNavLockedRef = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [step, aiMessage]);
  useEffect(() => { dayNavLockedRef.current = false; }, [currentDayIndex, step]);

  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const check = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
      const canScroll = el.scrollHeight > el.clientHeight + 10;
      setShowPanelScrollCue(canScroll && !atBottom);
    };
    const t = setTimeout(check, 120);
    el.addEventListener("scroll", check, { passive: true });
    return () => { clearTimeout(t); el.removeEventListener("scroll", check); };
  }, [step, mode, editStep, blockStep, open]);

  function handleClose() {
    setOpen(false);
  }

  function resetBlockState() {
    setBlockSelectedSlotId(null); setBlockRangeStart(""); setBlockRangeEnd(""); setPendingBlocks([]);
  }

  function resetEditState() {
    setEditOp(null); setEditSelectedSlotId(null); setEditAddDay(""); setEditRangeStart(""); setEditRangeEnd(""); setPendingEdits([]);
  }

  function handleOpen() {
    if (step === "done") {
      setStep("days"); setSelectedDays([]); setDayTimes({}); setAiMessage(""); setPendingSlots(null); setCurrentDayIndex(0);
    }
    if (blockStep === "done") { setBlockStep("input"); resetBlockState(); }
    if (editStep === "done") { setEditStep("input"); resetEditState(); }
    setOpen(true);
  }

  function switchMode(m: "create" | "block" | "edit") {
    setMode(m);
  }

  async function handleICSFile(file: File) {
    setIcsError(null);
    const isZip = file.name.endsWith(".zip");
    const isIcs = file.name.endsWith(".ics");
    if (!isZip && !isIcs) {
      setIcsError("Please upload a .zip or .ics file exported from Google Calendar.");
      return;
    }
    setIcsFileName(file.name);

    let icsContent = "";
    if (isZip) {
      try {
        const zip = await JSZip.loadAsync(file);
        const icsFiles = Object.keys(zip.files).filter((n) => n.endsWith(".ics"));
        if (icsFiles.length === 0) {
          setIcsError("No .ics file found inside the ZIP. Make sure this is a Google Calendar export.");
          return;
        }
        // Concatenate all .ics files found (Google exports one per calendar)
        const parts = await Promise.all(icsFiles.map((name) => zip.files[name].async("string")));
        icsContent = parts.join("\n");
      } catch {
        setIcsError("Could not read the ZIP file. Please try exporting again from Google Calendar.");
        return;
      }
    } else {
      icsContent = await file.text();
    }

    const parsed = parseICSToSlots(icsContent);
    if (parsed.length === 0) {
      setIcsError("No teaching-related events found. Only events with words like \"teaching\", \"slot\", \"lesson\", \"class\", \"session\", \"tutorial\", or similar in the title are imported.");
      return;
    }
    setIcsParsed(parsed);
    // Auto-select first date
    const firstDate = parsed[0].dateKey;
    setIcsSelectedDate(firstDate);
  }

  function handleAddEditOp() {
    if (editOp === "add") {
      if (!editAddDay || !editRangeStart || !editRangeEnd) return;
      if (toMins(editRangeStart) >= toMins(editRangeEnd)) return;
      const label = `${editAddDay} ${fmt12(editRangeStart)} – ${fmt12(editRangeEnd)}`;
      setPendingEdits((prev) => [...prev, { op: "create", label, startTime: editRangeStart, endTime: editRangeEnd }]);
      setEditAddDay(""); setEditRangeStart(""); setEditRangeEnd("");
    } else if (editOp === "modify") {
      if (editSelectedSlotId === null || !editRangeStart || !editRangeEnd) return;
      if (toMins(editRangeStart) >= toMins(editRangeEnd)) return;
      const slot = slots.find((s) => s.id === editSelectedSlotId)!;
      const dayPrefix = ALL_DAYS.find((d) => slot.label.startsWith(d)) ?? slot.label.split(" ")[0];
      const label = `${dayPrefix} ${fmt12(editRangeStart)} – ${fmt12(editRangeEnd)}`;
      setPendingEdits((prev) => [...prev, { op: "update", slotId: editSelectedSlotId, label, startTime: editRangeStart, endTime: editRangeEnd }]);
      setEditSelectedSlotId(null); setEditRangeStart(""); setEditRangeEnd("");
    } else if (editOp === "remove") {
      if (editSelectedSlotId === null) return;
      if (pendingEdits.some((e) => e.op === "delete" && e.slotId === editSelectedSlotId)) return;
      setPendingEdits((prev) => [...prev, { op: "delete", slotId: editSelectedSlotId }]);
      setEditSelectedSlotId(null);
    }
  }

  function handleRemoveEditOp(i: number) {
    setPendingEdits((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleApplyEdits() {
    if (pendingEdits.length === 0) return;
    setApplyingEdits(true);
    for (const op of pendingEdits) {
      if (op.op === "create") {
        await adminFetch("/api/timeslots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: op.label, startTime: op.startTime, endTime: op.endTime }),
        });
      } else if (op.op === "update") {
        const { slotId, ...updates } = op;
        const body: Record<string, string> = {};
        if (updates.label) body.label = updates.label;
        if (updates.startTime) body.startTime = updates.startTime;
        if (updates.endTime) body.endTime = updates.endTime;
        await adminFetch(`/api/timeslots/${slotId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else if (op.op === "delete") {
        await adminFetch(`/api/timeslots/${op.slotId}`, { method: "DELETE" });
      }
    }
    setApplyingEdits(false);
    setEditStep("done");
    onSlotsCreated();
  }

  function handleAddBlockRange() {
    if (blockSelectedSlotId === null || !blockRangeStart || !blockRangeEnd) return;
    if (toMins(blockRangeStart) >= toMins(blockRangeEnd)) return;
    const slot = slots.find((s) => s.id === blockSelectedSlotId);
    if (!slot) return;
    const newRange = { start: blockRangeStart, end: blockRangeEnd };
    setPendingBlocks((prev) => {
      const existing = prev.find((b) => b.slotId === blockSelectedSlotId);
      if (existing) {
        return prev.map((b) => b.slotId === blockSelectedSlotId ? { ...b, ranges: [...b.ranges, newRange] } : b);
      }
      return [...prev, { slotId: blockSelectedSlotId, slotLabel: slot.label, ranges: [newRange] }];
    });
    setBlockRangeStart(""); setBlockRangeEnd("");
  }

  function handleRemoveBlockRange(slotId: number, rangeIdx: number) {
    setPendingBlocks((prev) => {
      const updated = prev.map((b) => b.slotId === slotId ? { ...b, ranges: b.ranges.filter((_, i) => i !== rangeIdx) } : b);
      return updated.filter((b) => b.ranges.length > 0);
    });
  }

  async function handleApplyBlocks() {
    if (pendingBlocks.length === 0) return;
    setApplying(true);
    for (const block of pendingBlocks) {
      const existing = slots.find((s) => s.id === block.slotId)?.blockedTimes ?? [];
      const fullList = [...existing, ...block.ranges];
      await adminFetch(`/api/timeslots/${block.slotId}/blocked-times`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges: fullList }),
      });
    }
    setApplying(false);
    setBlockStep("done");
    onSlotsCreated();
  }

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleDaysContinue() {
    if (selectedDays.length === 0) return;
    // Init times for each selected day
    const init: Record<string, { start: string; end: string }> = {};
    for (const d of selectedDays) init[d] = { start: "09:00", end: "11:00" };
    setDayTimes(init);
    setCurrentDayIndex(0);
    setStep("times");
  }

  async function handleSubmitSchedule() {
    // Build summary message for AI
    const orderedDays = ALL_DAYS.filter((d) => selectedDays.includes(d));
    const summary = orderedDays
      .map((d) => {
        const t = dayTimes[d];
        const fmtTime = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
        };
        return `${d}: ${fmtTime(t.start)} – ${fmtTime(t.end)}`;
      })
      .join(", ");

    const userMessage = `I'm available on: ${summary}`;
    setStep("processing");
    setAiMessage("");

    try {
      const res = await adminFetch("/api/ai/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: userMessage }] }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            full += data.content;
            setAiMessage(full);
          }
        }
      }

      const slots = parseSlotsFromResponse(full);
      if (slots && slots.length > 0) {
        setPendingSlots(slots);
        setAiMessage(stripTimeslotBlock(full));
      }
      setStep("confirm");
    } catch {
      setAiMessage("Something went wrong. Please try again.");
      setStep("confirm");
    }
  }

  async function handleCreateSlots() {
    if (!pendingSlots) return;
    setCreating(true);
    for (const slot of pendingSlots) {
      await new Promise<void>((resolve) =>
        createSlot.mutate({ data: slot }, { onSuccess: () => resolve(), onError: () => resolve() })
      );
    }
    setCreating(false);
    setStep("done");
    onSlotsCreated();
  }

  const orderedSelected = ALL_DAYS.filter((d) => selectedDays.includes(d));

  return (
    <>
      {/* Trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-xl font-semibold text-sm"
      >
        <Sparkles className="w-4 h-4" />
        AI Scheduling Assistant
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", bounce: 0.22, duration: 0.4 }}
            className="fixed bottom-24 right-6 z-50 w-[min(440px,calc(100vw-3rem))] max-h-[calc(100vh-7rem)] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-0 border-b border-border bg-primary/5 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Scheduling Assistant</p>
                    <p className="text-xs text-muted-foreground">
                      {mode === "create" && step === "days" && "Step 1 of 2 — Pick your days"}
                      {mode === "create" && step === "ics" && "Import from Google Calendar — pick a week"}
                      {mode === "create" && step === "times" && "Step 2 of 2 — Set your hours"}
                      {mode === "create" && step === "processing" && "Generating your schedule…"}
                      {mode === "create" && step === "confirm" && "Ready to add slots"}
                      {mode === "create" && step === "done" && "Schedule created!"}
                      {mode === "edit" && editStep === "input" && "Pick what to change"}
                      {mode === "edit" && editStep === "done" && "Schedule updated!"}
                      {mode === "block" && blockStep === "input" && "Pick times to block off"}
                      {mode === "block" && blockStep === "done" && "Times blocked!"}
                    </p>
                  </div>
                </div>
                <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Mode tabs */}
              <div className="flex gap-1 -mb-px">
                {(["create", "edit", "block"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      "px-3 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-all",
                      mode === m
                        ? "border-border bg-card text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "create" ? "Create" : m === "edit" ? "Edit" : "Block"}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div ref={scrollBodyRef} className="overflow-y-auto flex-1 min-h-0">
              <AnimatePresence mode="wait">

                {/* ── Create Schedule mode ── */}
                {mode === "create" && step === "days" && (
                  <motion.div
                    key="days"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-5 space-y-4"
                  >
                    <p className="text-sm text-foreground font-medium">Which days are you generally available?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_DAYS.map((day) => {
                        const checked = selectedDays.includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                              checked
                                ? "bg-primary/10 border-primary text-primary"
                                : "bg-muted/30 border-border text-foreground hover:bg-muted/60"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                              checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                            )}>
                              {checked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            {day}
                          </button>
                        );
                      })}
                    </div>

                    {selectedDays.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""} selected
                      </p>
                    )}

                    <Button
                      className="w-full"
                      onClick={handleDaysContinue}
                      disabled={selectedDays.length === 0}
                    >
                      Continue
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] text-muted-foreground">or</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <button
                      type="button"
                      onClick={() => { setIcsError(null); setIcsFileName(null); setStep("ics"); }}
                      className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/50 rounded-xl py-3 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Import from Google Calendar (.zip / .ics)
                    </button>
                  </motion.div>
                )}

                {mode === "create" && step === "ics" && (
                  <motion.div
                    key="ics"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-5 space-y-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Upload your Google Calendar export</p>
                      <p className="text-xs text-muted-foreground">
                        In Google Calendar, go to <span className="font-medium text-foreground">Settings → Import &amp; export → Export</span> to download a .ics file, then upload it here.
                      </p>
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".ics,.zip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleICSFile(file);
                      }}
                    />

                    {/* Drop zone */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleICSFile(file);
                      }}
                      className="w-full flex flex-col items-center gap-3 py-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      </div>
                      {icsFileName ? (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">{icsFileName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Click to choose a different file</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">Click or drag &amp; drop your file</p>
                          <p className="text-xs text-muted-foreground mt-0.5">.zip or .ics — Google Calendar export</p>
                        </div>
                      )}
                    </button>

                    {icsError && (
                      <p className="text-xs text-destructive flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{icsError}
                      </p>
                    )}

                    {/* Week picker — shown once a file is successfully parsed */}
                    {icsParsed.length > 0 && (() => {
                      const cutoff = new Date();
                      cutoff.setDate(cutoff.getDate() - 7);
                      const cutoffKey = cutoff.toISOString().slice(0, 10);
                      const filtered = icsParsed.filter(s => s.dateKey >= cutoffKey);
                      const uniqueWeeks = [...new Map(filtered.map(s => [s.weekKey, s.weekLabel])).entries()];
                      // If current selection was clipped, fall back to first available week
                      const activeWeek = uniqueWeeks.find(([k]) => k === icsSelectedDate)
                        ? icsSelectedDate
                        : uniqueWeeks[0]?.[0] ?? "";
                      const forWeek = filtered.filter(s => s.weekKey === activeWeek);
                      const count = forWeek.length;

                      if (uniqueWeeks.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No teaching events found in the past week or upcoming dates in this file.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-3 pt-1">
                          <div>
                            <p className="text-sm font-medium text-foreground mb-2">Which week do you want to import?</p>
                            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                              {uniqueWeeks.map(([key, label]) => {
                                const n = filtered.filter(s => s.weekKey === key).length;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => setIcsSelectedDate(key)}
                                    className={cn(
                                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors text-left",
                                      activeWeek === key
                                        ? "border-primary bg-primary/10 text-primary font-semibold"
                                        : "border-border text-foreground hover:bg-muted"
                                    )}
                                  >
                                    <span>{label}</span>
                                    <span className="text-xs text-muted-foreground font-normal">{n} event{n !== 1 ? "s" : ""}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Preview the individual days in the selected week */}
                          {forWeek.length > 0 && (
                            <div className="bg-muted/50 rounded-lg px-3 py-2.5 space-y-1">
                              {forWeek.map((s, i) => (
                                <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 shrink-0 text-primary/50" />
                                  <span className="font-medium text-foreground/70">{s.dateLabel}:</span>
                                  <span>{s.label} ({fmt12(s.startTime)} – {fmt12(s.endTime)})</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <Button
                            className="w-full"
                            disabled={!activeWeek || count === 0}
                            onClick={() => {
                              setPendingSlots(forWeek);
                              setAiMessage(`Importing ${count} event${count !== 1 ? "s" : ""} from the week of ${uniqueWeeks.find(([k]) => k === activeWeek)?.[1]}. Review and confirm below.`);
                              setStep("confirm");
                            }}
                          >
                            Import {count} event{count !== 1 ? "s" : ""}
                            <ArrowRight className="w-4 h-4 ml-1.5" />
                          </Button>
                        </div>
                      );
                    })()}

                    <Button variant="outline" className="w-full" onClick={() => { setIcsParsed([]); setIcsSelectedDate(""); setStep("days"); }}>
                      Back
                    </Button>
                  </motion.div>
                )}

                {mode === "create" && step === "times" && (() => {
                  const currentDay = orderedSelected[currentDayIndex];
                  const isLast = currentDayIndex === orderedSelected.length - 1;
                  const isFirst = currentDayIndex === 0;
                  const timeValid = dayTimes[currentDay]
                    ? toMins(dayTimes[currentDay].start) < toMins(dayTimes[currentDay].end)
                    : false;
                  return (
                    <motion.div
                      key={`times-${currentDay}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-5 space-y-4"
                    >
                      {/* Progress dots */}
                      <div className="flex items-center gap-1.5 justify-center">
                        {orderedSelected.map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-full transition-all duration-200",
                              i === currentDayIndex
                                ? "w-4 h-2 bg-primary"
                                : i < currentDayIndex
                                ? "w-2 h-2 bg-primary/50"
                                : "w-2 h-2 bg-muted-foreground/20"
                            )}
                          />
                        ))}
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">
                          Day {currentDayIndex + 1} of {orderedSelected.length}
                        </p>
                        <p className="text-base text-foreground font-semibold">
                          What hours are you free on {currentDay}?
                        </p>
                      </div>

                      <div className="bg-muted/30 rounded-xl border border-border p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">From</label>
                            <input
                              type="time"
                              value={dayTimes[currentDay]?.start ?? "09:00"}
                              onChange={(e) =>
                                setDayTimes((prev) => ({
                                  ...prev,
                                  [currentDay]: { ...prev[currentDay], start: e.target.value },
                                }))
                              }
                              className="w-full text-sm bg-background border border-border rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">To</label>
                            <input
                              type="time"
                              value={dayTimes[currentDay]?.end ?? "11:00"}
                              onChange={(e) =>
                                setDayTimes((prev) => ({
                                  ...prev,
                                  [currentDay]: { ...prev[currentDay], end: e.target.value },
                                }))
                              }
                              className="w-full text-sm bg-background border border-border rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        </div>
                        {!timeValid && dayTimes[currentDay] && (
                          <p className="text-[11px] text-destructive mt-2">Start time must be before end time.</p>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            if (dayNavLockedRef.current) return;
                            dayNavLockedRef.current = true;
                            if (isFirst) setStep("days");
                            else setCurrentDayIndex((i) => Math.max(i - 1, 0));
                          }}
                        >
                          Back
                        </Button>
                        {isLast ? (
                          <Button className="flex-1" onClick={handleSubmitSchedule} disabled={!timeValid}>
                            Create My Schedule
                            <Sparkles className="w-4 h-4 ml-1.5" />
                          </Button>
                        ) : (
                          <Button
                            className="flex-1"
                            disabled={!timeValid}
                            onClick={() => {
                              if (dayNavLockedRef.current || !timeValid) return;
                              dayNavLockedRef.current = true;
                              setCurrentDayIndex((i) => Math.min(i + 1, orderedSelected.length - 1));
                            }}
                          >
                            Next — {orderedSelected[currentDayIndex + 1]}
                            <ArrowRight className="w-4 h-4 ml-1.5" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })()}

                {mode === "create" && step === "processing" && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 flex flex-col items-center text-center gap-4"
                  >
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Building your schedule…</p>
                      <p className="text-sm text-muted-foreground mt-1">The AI is organizing your time slots.</p>
                    </div>
                    {aiMessage && (
                      <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 text-left w-full whitespace-pre-wrap">{aiMessage}</p>
                    )}
                  </motion.div>
                )}

                {mode === "create" && step === "confirm" && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 space-y-4"
                  >
                    {aiMessage && (
                      <div className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <p className="text-sm text-foreground bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 leading-relaxed">{aiMessage}</p>
                      </div>
                    )}

                    {pendingSlots && pendingSlots.length > 0 ? (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-primary" />
                          {pendingSlots.length} time slot{pendingSlots.length !== 1 ? "s" : ""} ready
                        </p>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {pendingSlots.map((s, i) => (
                            <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Clock className="w-3 h-3 shrink-0 text-primary/60" />
                              <span className="truncate">{s.label}</span>
                              <span className="shrink-0 text-primary/50">· {fmt12(s.startTime)} – {fmt12(s.endTime)}</span>
                            </div>
                          ))}
                        </div>
                        <Button className="w-full" onClick={handleCreateSlots} isLoading={creating}>
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Add These Slots
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={creating}
                          onClick={() => { setPendingSlots([]); setAiMessage(""); setStep("days"); }}
                        >
                          ← Start Over
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No slots could be generated. Please try again.</p>
                        <Button variant="outline" className="mt-3" onClick={() => setStep("days")}>
                          Start Over
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}

                {mode === "create" && step === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 flex flex-col items-center text-center gap-3"
                  >
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7 text-green-600" />
                    </div>
                    <p className="font-bold text-foreground text-lg">Schedule Created!</p>
                    <p className="text-sm text-muted-foreground">Your time slots are ready for student bookings.</p>
                    <Button variant="outline" onClick={handleClose}>Close</Button>
                  </motion.div>
                )}

                {/* ── Edit Schedule mode ── */}
                {mode === "edit" && editStep === "input" && (
                  <motion.div
                    key="edit-input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-5 space-y-5"
                  >
                    {/* Operation selector */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">1. What do you want to do?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { id: "add", icon: Plus, label: "Add Slot", color: "text-green-600", bg: "bg-green-50 border-green-200", activeBg: "bg-green-500 border-green-500 text-white" },
                          { id: "modify", icon: ArrowRight, label: "Edit Slot", color: "text-blue-600", bg: "bg-blue-50 border-blue-200", activeBg: "bg-blue-500 border-blue-500 text-white" },
                          { id: "remove", icon: Trash2, label: "Remove Slot", color: "text-red-500", bg: "bg-red-50 border-red-200", activeBg: "bg-red-500 border-red-500 text-white" },
                        ] as const).map(({ id, icon: Icon, label, bg, activeBg }) => (
                          <button
                            key={id}
                            onClick={() => { setEditOp(id); setEditSelectedSlotId(null); setEditAddDay(""); setEditRangeStart(""); setEditRangeEnd(""); }}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all",
                              editOp === id ? activeBg : bg + " text-foreground hover:opacity-80"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Add: day picker + time range */}
                    {editOp === "add" && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Pick a day</p>
                        <div className="flex flex-wrap gap-2">
                          {ALL_DAYS.map((d) => (
                            <button
                              key={d}
                              onClick={() => { setEditAddDay(d); setEditRangeStart(""); setEditRangeEnd(""); }}
                              className={cn(
                                "text-xs px-3 py-1.5 rounded-full border font-medium transition-all",
                                editAddDay === d ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/50"
                              )}
                            >
                              {DAY_SHORT[d]}
                            </button>
                          ))}
                        </div>
                        {editAddDay && (() => {
                          const timeOpts = genTimeOptions("06:00", "22:00", 30);
                          const endOpts = timeOpts.filter((t) => !editRangeStart || toMins(t) > toMins(editRangeStart));
                          const canAdd = editRangeStart && editRangeEnd && toMins(editRangeStart) < toMins(editRangeEnd);
                          return (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Set hours</p>
                              <div className="flex items-center gap-2">
                                <select value={editRangeStart} onChange={(e) => { setEditRangeStart(e.target.value); setEditRangeEnd(""); }} className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30">
                                  <option value="">From</option>
                                  {timeOpts.slice(0, -1).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                </select>
                                <span className="text-muted-foreground text-xs shrink-0">to</span>
                                <select value={editRangeEnd} onChange={(e) => setEditRangeEnd(e.target.value)} disabled={!editRangeStart} className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                                  <option value="">To</option>
                                  {endOpts.map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                </select>
                                <button onClick={handleAddEditOp} disabled={!canAdd} className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Modify: slot picker + time range */}
                    {editOp === "modify" && (
                      <div className="space-y-3">
                        {slots.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">No slots to edit yet.</p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Pick a slot to edit</p>
                            <div className="flex flex-wrap gap-2">
                              {slots.map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    setEditSelectedSlotId(s.id);
                                    setEditRangeStart(s.startTime);
                                    setEditRangeEnd(s.endTime);
                                  }}
                                  className={cn(
                                    "text-xs px-3 py-1.5 rounded-full border font-medium transition-all",
                                    editSelectedSlotId === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/50"
                                  )}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                            {editSelectedSlotId !== null && (() => {
                              const timeOpts = genTimeOptions("06:00", "22:00", 30);
                              const endOpts = timeOpts.filter((t) => !editRangeStart || toMins(t) > toMins(editRangeStart));
                              const canAdd = editRangeStart && editRangeEnd && toMins(editRangeStart) < toMins(editRangeEnd);
                              return (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Set new hours</p>
                                  <div className="flex items-center gap-2">
                                    <select value={editRangeStart} onChange={(e) => { setEditRangeStart(e.target.value); setEditRangeEnd(""); }} className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30">
                                      <option value="">From</option>
                                      {timeOpts.slice(0, -1).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                    </select>
                                    <span className="text-muted-foreground text-xs shrink-0">to</span>
                                    <select value={editRangeEnd} onChange={(e) => setEditRangeEnd(e.target.value)} disabled={!editRangeStart} className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                                      <option value="">To</option>
                                      {endOpts.map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                    </select>
                                    <button onClick={handleAddEditOp} disabled={!canAdd} className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors">
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    )}

                    {/* Remove: slot picker */}
                    {editOp === "remove" && (
                      <div className="space-y-3">
                        {slots.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">No slots to remove yet.</p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Tap a slot to remove it</p>
                            <div className="flex flex-wrap gap-2">
                              {slots.map((s) => {
                                const queued = pendingEdits.some((e) => e.op === "delete" && e.slotId === s.id);
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => { if (!queued) setPendingEdits((prev) => [...prev, { op: "delete", slotId: s.id }]); }}
                                    disabled={queued}
                                    className={cn(
                                      "text-xs px-3 py-1.5 rounded-full border font-medium transition-all",
                                      queued ? "bg-red-100 text-red-400 border-red-200 line-through" : "bg-background text-foreground border-border hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                                    )}
                                  >
                                    {s.label}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Pending queue */}
                    {pendingEdits.length > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Queued changes</p>
                        {pendingEdits.map((op, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded font-semibold uppercase text-[10px]",
                                op.op === "create" && "bg-green-100 text-green-700",
                                op.op === "update" && "bg-blue-100 text-blue-700",
                                op.op === "delete" && "bg-red-100 text-red-700",
                              )}>
                                {op.op === "create" ? "add" : op.op === "update" ? "edit" : "remove"}
                              </span>
                              <span className="text-muted-foreground">
                                {op.op === "create" && `${op.label}`}
                                {op.op === "update" && `${slots.find((s) => s.id === op.slotId)?.label.split(" ")[0] ?? "Slot"} → ${fmt12(op.startTime ?? "")} – ${fmt12(op.endTime ?? "")}`}
                                {op.op === "delete" && `${slots.find((s) => s.id === op.slotId)?.label ?? `Slot #${op.slotId}`}`}
                              </span>
                            </span>
                            <button onClick={() => handleRemoveEditOp(i)} className="ml-2 text-muted-foreground/60 hover:text-destructive transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Apply */}
                    <Button
                      className="w-full"
                      onClick={handleApplyEdits}
                      isLoading={applyingEdits}
                      disabled={pendingEdits.length === 0}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Apply {pendingEdits.length || ""} {pendingEdits.length === 1 ? "Change" : "Changes"}
                    </Button>
                  </motion.div>
                )}

                {mode === "edit" && editStep === "done" && (
                  <motion.div
                    key="edit-done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 flex flex-col items-center text-center gap-3"
                  >
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7 text-green-600" />
                    </div>
                    <p className="font-bold text-foreground text-lg">Schedule Updated!</p>
                    <p className="text-sm text-muted-foreground">Your changes have been saved.</p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setEditStep("input"); resetEditState(); }}>
                        Edit More
                      </Button>
                      <Button variant="outline" onClick={handleClose}>Close</Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Block Times mode ── */}
                {mode === "block" && blockStep === "input" && (
                  <motion.div
                    key="block-input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-5 space-y-5"
                  >
                    {slots.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p className="text-sm">No schedule set up yet.</p>
                        <p className="text-xs mt-1">Use the Create Schedule tab first.</p>
                      </div>
                    ) : (
                      <>
                        {/* Step 1: pick a day */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">1. Select a day</p>
                          <div className="flex flex-wrap gap-2">
                            {slots.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => { setBlockSelectedSlotId(s.id); setBlockRangeStart(""); setBlockRangeEnd(""); }}
                                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                                  blockSelectedSlotId === s.id
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-foreground border-border hover:border-primary/50"
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Step 2: pick time range */}
                        {blockSelectedSlotId !== null && (() => {
                          const slot = slots.find((s) => s.id === blockSelectedSlotId)!;
                          const timeOpts = genTimeOptions(slot.startTime, slot.endTime, 30);
                          const endOpts = timeOpts.filter((t) => !blockRangeStart || toMins(t) > toMins(blockRangeStart));
                          const canAdd = blockRangeStart && blockRangeEnd && toMins(blockRangeStart) < toMins(blockRangeEnd);
                          return (
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Choose the time range</p>
                              <div className="flex items-center gap-2">
                                <select
                                  value={blockRangeStart}
                                  onChange={(e) => { setBlockRangeStart(e.target.value); setBlockRangeEnd(""); }}
                                  className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                  <option value="">From</option>
                                  {timeOpts.slice(0, -1).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                </select>
                                <span className="text-muted-foreground text-xs shrink-0">to</span>
                                <select
                                  value={blockRangeEnd}
                                  onChange={(e) => setBlockRangeEnd(e.target.value)}
                                  disabled={!blockRangeStart}
                                  className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                                >
                                  <option value="">To</option>
                                  {endOpts.map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                                </select>
                                <button
                                  onClick={handleAddBlockRange}
                                  disabled={!canAdd}
                                  className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Pending list */}
                        {pendingBlocks.length > 0 && (
                          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-semibold text-foreground">Queued blocks</p>
                            {pendingBlocks.map((block) =>
                              block.ranges.map((r, j) => (
                                <div key={`${block.slotId}-${j}`} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 shrink-0" />
                                    <span className="font-medium text-foreground">{block.slotLabel}</span>
                                    <span>·</span>
                                    <span>{fmt12(r.start)} – {fmt12(r.end)}</span>
                                  </span>
                                  <button onClick={() => handleRemoveBlockRange(block.slotId, j)} className="ml-2 text-destructive/60 hover:text-destructive transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Apply button */}
                        <Button
                          className="w-full"
                          onClick={handleApplyBlocks}
                          isLoading={applying}
                          disabled={pendingBlocks.length === 0}
                        >
                          <Ban className="w-4 h-4 mr-1.5" />
                          Block {pendingBlocks.reduce((n, b) => n + b.ranges.length, 0) || ""} {pendingBlocks.reduce((n, b) => n + b.ranges.length, 0) === 1 ? "Range" : "Ranges"}
                        </Button>
                      </>
                    )}
                  </motion.div>
                )}

                {mode === "block" && blockStep === "done" && (
                  <motion.div
                    key="block-done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 flex flex-col items-center text-center gap-3"
                  >
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7 text-green-600" />
                    </div>
                    <p className="font-bold text-foreground text-lg">Times Blocked!</p>
                    <p className="text-sm text-muted-foreground">Those time slots will no longer appear for students.</p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setBlockStep("input"); resetBlockState(); }}>
                        Block More
                      </Button>
                      <Button variant="outline" onClick={handleClose}>Close</Button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            {/* Panel scroll cue */}
            <AnimatePresence>
              {showPanelScrollCue && (
                <motion.div
                  key="panel-scroll-cue"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => scrollBodyRef.current?.scrollBy({ top: 200, behavior: "smooth" })}
                  className="shrink-0 flex flex-col items-center py-1.5 cursor-pointer bg-gradient-to-t from-card to-transparent"
                >
                  <span className="text-[10px] font-semibold text-muted-foreground/70 tracking-wide uppercase">
                    Scroll for more
                  </span>
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                    className="text-primary/60"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress dots */}
            {mode === "create" && (step === "days" || step === "times") && (
              <div className="flex justify-center gap-1.5 py-3 border-t border-border shrink-0">
                {(["days", "times"] as const).map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      step === s ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Weekly Calendar ──────────────────────────────────────────────────────────
function WeeklyCalendar() {
  const { data: slots, refetch: refetchSlots } = useGetTimeSlots();
  const { data: bookings } = useGetBookings();
  const createSlot = useCreateTimeSlot();

  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const priorityMatchesSlot = (p: string | null | undefined, slotId: number) =>
    !!p && p.includes("|") && Number(p.split("|")[0]) === slotId;

  const bookingsForSlot = (slotId: number) =>
    (bookings ?? []).filter((b) =>
      [b.priority1, b.priority2, b.priority3].some((p) => priorityMatchesSlot(p, slotId))
    );

  const openAddForm = (day: string) => {
    setAddingDay(day);
    setAddStart("");
    setAddEnd("");
    setAddError(null);
  };

  const closeAddForm = () => {
    setAddingDay(null);
    setAddError(null);
  };

  const handleAdd = (day: string) => {
    if (!addStart || !addEnd) { setAddError("Please fill in both times."); return; }
    if (toMins(addStart) >= toMins(addEnd)) { setAddError("Start must be before end."); return; }
    setAddError(null);
    const autoLabel = `${day} ${fmt12(addStart)} – ${fmt12(addEnd)}`;
    createSlot.mutate(
      { data: { label: autoLabel, startTime: addStart, endTime: addEnd } },
      { onSuccess: () => { closeAddForm(); refetchSlots(); } }
    );
  };

  return (
    <div className="space-y-3">
      {ALL_DAYS.map((day) => {
        const daySlots = (slots ?? []).filter((s) => dayOfSlot(s.label) === day);
        const dayBookings = daySlots.flatMap((s) => bookingsForSlot(s.id));
        const isAdding = addingDay === day;
        return (
          <div key={day} className={cn(
            "rounded-xl border overflow-hidden",
            daySlots.length > 0 ? "border-border bg-card" : "border-dashed border-border/50 bg-muted/20"
          )}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", daySlots.length > 0 ? "bg-primary" : "bg-muted-foreground/30")} />
                <span className="font-semibold text-sm text-foreground">{day}</span>
              </div>
              <div className="flex items-center gap-3">
                {daySlots.length > 0 && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}</span>
                    {dayBookings.length > 0 && (
                      <span className="flex items-center gap-1 text-primary font-medium"><Users className="w-3 h-3" />{dayBookings.length} booked</span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => isAdding ? closeAddForm() : openAddForm(day)}
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border transition-all",
                    isAdding
                      ? "border-border text-muted-foreground hover:bg-muted/40"
                      : "border-primary/30 text-primary bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  {isAdding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {isAdding ? "Cancel" : "Add"}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 pt-0 space-y-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-muted-foreground pt-2">New slot for {day}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Start Time</label>
                        <input
                          type="time"
                          value={addStart}
                          onChange={(e) => { setAddStart(e.target.value); setAddError(null); }}
                          className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">End Time</label>
                        <input
                          type="time"
                          value={addEnd}
                          onChange={(e) => { setAddEnd(e.target.value); setAddError(null); }}
                          className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                        />
                      </div>
                    </div>
                    {addError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />{addError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAdd(day)}
                      disabled={createSlot.isPending}
                      className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {createSlot.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add Slot
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {daySlots.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {daySlots.map((slot) => {
                  const slotBookings = bookingsForSlot(slot.id);
                  const isExpanded = expandedSlotId === slot.id;
                  return (
                    <div key={slot.id}>
                      <button
                        onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}
                        disabled={slotBookings.length === 0}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-all",
                          slot.available
                            ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                            : "bg-muted/40 border-border opacity-60",
                          isExpanded && "bg-primary/10 border-primary/30",
                          slotBookings.length === 0 && "cursor-default"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">{slot.startTime} – {slot.endTime}</span>
                          {!slot.available && <span className="text-muted-foreground">(unavailable)</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {slotBookings.length > 0 && (
                            <span className="flex items-center gap-1 text-primary font-semibold"><Users className="w-3 h-3" />{slotBookings.length}</span>
                          )}
                          {slotBookings.length > 0 && (
                            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                          )}
                        </div>
                      </button>
                      <AnimatePresence>
                        {isExpanded && slotBookings.length > 0 && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                            <div className="mt-1 ml-4 space-y-1">
                              {slotBookings.map((b, i) => (
                                <motion.div key={b.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="px-3 py-2 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">{b.name.charAt(0).toUpperCase()}</div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-foreground truncate">{b.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{b.email}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3 Priority Choices</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {[b.priority1, b.priority2, b.priority3].map((p, pi) => {
                                        const isMatch = priorityMatchesSlot(p, slot.id);
                                        return (
                                          <div key={pi} className={cn(
                                            "flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5 border",
                                            isMatch
                                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                                              : "bg-background border-border/50 opacity-50"
                                          )}>
                                            <span className={cn("font-bold text-[10px] shrink-0", PRIORITY_COLORS[pi])}>
                                              {["1st", "2nd", "3rd"][pi]}
                                            </span>
                                            <span className="font-medium">{fmtPriority(p, slots)}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {(() => {
        const unassigned = (bookings ?? []).filter(b => !(b as any).assignedTime);
        if (unassigned.length === 0) return null;
        return (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <span className="font-semibold text-sm text-muted-foreground">Unassigned</span>
              </div>
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Users className="w-3 h-3" />{unassigned.length} student{unassigned.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="px-4 pb-3 space-y-1.5">
              {unassigned.map((b) => (
                <div key={b.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-background border border-border/50">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs shrink-0">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Main Teacher Page ────────────────────────────────────────────────────────
export default function Teacher() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const teacherSlug = getTeacherInfo()?.slug ?? "";
  const { data: slots, isLoading, refetch: refetchSlots } = useGetTimeSlots();
  const { data: bookings, refetch: refetchBookings } = useGetBookings();
  const createSlot = useCreateTimeSlot();
  const updateSlot = useUpdateTimeSlot();
  const deleteSlot = useDeleteTimeSlot();

  const [tab, setTab] = useState<"slots" | "calendar" | "schedule" | "applied">("slots");
  const [hideFullyBlocked, setHideFullyBlocked] = useState(true);
  const [blockFromAppointments, setBlockFromAppointments] = useState(true);
  const [durationOptions, setDurationOptions] = useState<DurationOption[] | null>(null);
  const [numChoices, setNumChoices] = useState(3);
  const [minStudentsPerSlot, setMinStudentsPerSlot] = useState(1);
  const [maxStudentsPerSlot, setMaxStudentsPerSlot] = useState(1);
  const [showDurationDialog, setShowDurationDialog] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [clearBookingsConfirm, setClearBookingsConfirm] = useState(false);
  const [clearingBookings, setClearingBookings] = useState(false);
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const [form, setForm] = useState<NewSlotForm>({ day: "", startTime: "", endTime: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [showPasscodeDialog, setShowPasscodeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showScrollCue, setShowScrollCue] = useState(false);

  useEffect(() => {
    adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`)
      .then(r => r.json())
      .then(d => {
        if (typeof d.hideFullyBlocked === "boolean") setHideFullyBlocked(d.hideFullyBlocked);
        if (typeof d.blockFromAppointments === "boolean") setBlockFromAppointments(d.blockFromAppointments);
        if (Array.isArray(d.durationOptions)) setDurationOptions(d.durationOptions);
        else setDurationOptions(null);
        if (typeof d.numChoices === "number" && d.numChoices >= 1 && d.numChoices <= 5) setNumChoices(d.numChoices);
        if (typeof d.minStudentsPerSlot === "number" && d.minStudentsPerSlot >= 1) setMinStudentsPerSlot(d.minStudentsPerSlot);
        if (typeof d.maxStudentsPerSlot === "number" && d.maxStudentsPerSlot >= 1) setMaxStudentsPerSlot(d.maxStudentsPerSlot);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    const check = () => {
      const canScroll = document.documentElement.scrollHeight > window.innerHeight + 10;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40;
      setShowScrollCue(canScroll && !atBottom);
    };
    const t = setTimeout(check, 80);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [tab]);

  type SchedulePref = { priority: number; slotLabel: string; timeRange: string; assignedTime: string };
  type ScheduleResult = {
    bookingId: number; name: string; email: string;
    assignedPriority: number | null; assignedSlotLabel: string | null;
    assignedTimeRange: string | null; assignedTime: string | null;
    preferences: SchedulePref[];
  };
  type ScheduleSummary = { total: number; got1st: number; got2nd: number; got3rd: number; unassigned: number; totalScore: number };
  const [schedulePreview, setSchedulePreview] = useState<ScheduleResult[] | null>(null);
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummary | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);
  const [scheduleApplied, setScheduleApplied] = useState(false);
  const [clearScheduleConfirm, setClearScheduleConfirm] = useState(false);
  const [isClearingSchedule, setIsClearingSchedule] = useState(false);
  const [aiPreferences, setAiPreferences] = useState("");
  const [isAiScheduling, setIsAiScheduling] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [aiReasoningSummary, setAiReasoningSummary] = useState<string | null>(null);
  const [scheduleIsAiGenerated, setScheduleIsAiGenerated] = useState(false);
  type EditOverride = { assignedPriority: number | null; assignedTime: string | null; assignedSlotLabel: string | null; assignedTimeRange: string | null };
  const [editOverrides, setEditOverrides] = useState<Record<number, EditOverride>>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingAssignId, setEditingAssignId] = useState<number | null>(null);
  const [assignDraft, setAssignDraft] = useState<{ slotId: number | null; start: string | null }>({ slotId: null, start: null });
  const [isSavingAssign, setIsSavingAssign] = useState(false);

  const effectivePreview = schedulePreview?.map(r => {
    const ov = editOverrides[r.bookingId];
    return ov !== undefined ? { ...r, ...ov } : r;
  }) ?? null;
  const PRIORITY_SCORE: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
  const effectiveSummary = effectivePreview ? {
    total: effectivePreview.length,
    got1st: effectivePreview.filter(r => r.assignedPriority === 1).length,
    got2nd: effectivePreview.filter(r => r.assignedPriority === 2).length,
    got3rd: effectivePreview.filter(r => r.assignedPriority === 3).length,
    unassigned: effectivePreview.filter(r => r.assignedPriority === null).length,
    totalScore: effectivePreview.reduce((acc, r) => acc + (r.assignedPriority != null ? (PRIORITY_SCORE[r.assignedPriority] ?? 0) : -6), 0),
  } : null;
  const hasUnsavedEdits = Object.keys(editOverrides).length > 0;

  const handleAiSchedule = async () => {
    if (!aiPreferences.trim() || isAiScheduling) return;
    setIsAiScheduling(true);
    setAiReasoning(null);
    setAiReasoningSummary(null);
    setScheduleApplied(false);
    setScheduleIsAiGenerated(false);
    setSchedulePreview(null);
    setScheduleSummary(null);
    setEditOverrides({});
    setEditingRow(null);
    try {
      const res = await adminFetch(`${import.meta.env.BASE_URL}api/ai/auto-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: aiPreferences, apply: false }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              full += data.content;
              setAiReasoning(full.replace(/<SCHEDULE_PARAMS>[\s\S]*?<\/SCHEDULE_PARAMS>/g, "").trim());
            }
            if (data.schedule) {
              setSchedulePreview(data.schedule.results);
              setScheduleSummary(data.schedule.summary);
              if (data.schedule.reasoning) setAiReasoningSummary(data.schedule.reasoning);
              setScheduleIsAiGenerated(true);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch {
      setAiReasoning("Something went wrong. Please try again.");
    } finally {
      setIsAiScheduling(false);
    }
  };

  const handleApplyAiSchedule = async () => {
    if (!schedulePreview) return;
    setIsApplyingSchedule(true);
    try {
      await adminFetch(`${import.meta.env.BASE_URL}api/bookings/apply-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: schedulePreview.map((r) => ({
            bookingId: r.bookingId,
            assignedPriority: r.assignedPriority,
            assignedTime: r.assignedTime,
          })),
        }),
      });
      setScheduleApplied(true);
      refetchBookings();
      queryClient.invalidateQueries({ queryKey: ["teacher-slots", teacherSlug] });
    } finally {
      setIsApplyingSchedule(false);
    }
  };

  const handleAddSlot = () => {
    if (!form.day || !form.startTime || !form.endTime) {
      setFormError("Please fill in all fields.");
      return;
    }
    if (toMins(form.startTime) >= toMins(form.endTime)) {
      setFormError("Start time must be before end time.");
      return;
    }
    setFormError(null);
    const autoLabel = `${form.day} ${fmt12(form.startTime)} – ${fmt12(form.endTime)}`;
    createSlot.mutate(
      { data: { label: autoLabel, startTime: form.startTime, endTime: form.endTime } },
      { onSuccess: () => { setForm({ day: "", startTime: "", endTime: "" }); setShowAddForm(false); refetchSlots(); } }
    );
  };

  const handleToggle = (id: number, current: boolean) => {
    updateSlot.mutate({ id, data: { available: !current } }, { onSuccess: () => refetchSlots() });
  };

  const handleToggleHideFullyBlocked = async () => {
    const next = !hideFullyBlocked;
    setHideFullyBlocked(next);
    await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideFullyBlocked: next }),
    });
  };

  const handleToggleBlockFromAppointments = async () => {
    const next = !blockFromAppointments;
    setBlockFromAppointments(next);
    await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockFromAppointments: next }),
    });
    refetchSlots();
  };

  const handleSaveDurationOptions = async (opts: DurationOption[] | null) => {
    const res = await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationOptions: opts }),
    });
    if (!res.ok) throw new Error("Failed to save");
    setDurationOptions(opts);
  };

  const handleSetNumChoices = async (n: number) => {
    const next = Math.max(1, Math.min(5, n));
    setNumChoices(next);
    await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numChoices: next }),
    });
  };

  const handleSetMinStudentsPerSlot = async (n: number) => {
    const next = Math.max(1, n);
    const clampedMax = Math.max(next, maxStudentsPerSlot);
    setMinStudentsPerSlot(next);
    setMaxStudentsPerSlot(clampedMax);
    await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minStudentsPerSlot: next, maxStudentsPerSlot: clampedMax }),
    });
  };

  const handleSetMaxStudentsPerSlot = async (n: number) => {
    const next = Math.max(1, n);
    const clampedMin = Math.min(next, minStudentsPerSlot);
    setMaxStudentsPerSlot(next);
    setMinStudentsPerSlot(clampedMin);
    await adminFetch(`${import.meta.env.BASE_URL}api/teachers/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minStudentsPerSlot: clampedMin, maxStudentsPerSlot: next }),
    });
  };

  const handleDelete = (id: number) => {
    deleteSlot.mutate({ id }, {
      onSuccess: () => {
        setDeleteConfirmId(null);
        if (expandedSlotId === id) setExpandedSlotId(null);
        refetchSlots();
        refetchBookings();
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 401) { signOutTeacher(); window.location.reload(); }
      },
    });
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    await adminFetch(`${import.meta.env.BASE_URL}api/timeslots`, { method: "DELETE" });
    setDeletingAll(false);
    setDeleteAllConfirm(false);
    setExpandedSlotId(null);
    refetchSlots();
    refetchBookings();
  };

  const handleClearBookings = async () => {
    setClearingBookings(true);
    await adminFetch(`${import.meta.env.BASE_URL}api/bookings`, { method: "DELETE" });
    setClearingBookings(false);
    setClearBookingsConfirm(false);
    refetchBookings();
  };

  const priorityMatchesSlot = (p: string | null | undefined, slotId: number) =>
    !!p && p.includes("|") && Number(p.split("|")[0]) === slotId;

  const bookingsForSlot = (slotId: number) =>
    (bookings ?? []).filter((b) =>
      [b.priority1, b.priority2, b.priority3].some((p) => priorityMatchesSlot(p, slotId))
    );

  const handleRemoveBlockedTime = async (slotId: number, removeIdx: number) => {
    const slot = (slots ?? []).find((s) => s.id === slotId);
    if (!slot) return;
    const newList = (slot.blockedTimes ?? []).filter((_, i) => i !== removeIdx);
    await adminFetch(`/api/timeslots/${slotId}/blocked-times`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ranges: newList }),
    });
    refetchSlots();
  };

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img src={`${import.meta.env.BASE_URL}images/bg-mesh.png`} alt="" className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none" />

      <div className="relative max-w-3xl mx-auto z-10 pb-24">
        <ChangePasscodeDialog open={showPasscodeDialog} onClose={() => setShowPasscodeDialog(false)} />
        <DeleteAccountDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)} />
        <DurationOptionsDialog
          open={showDurationDialog}
          onClose={() => setShowDurationDialog(false)}
          initial={durationOptions}
          onSave={handleSaveDurationOptions}
        />

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-6">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1.5" />Back to Student Booking
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPasscodeDialog(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/50 hover:border-border rounded-lg px-3 py-1.5 transition-all bg-card/60 hover:bg-card"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Change Passcode
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border/50 hover:border-destructive/40 rounded-lg px-3 py-1.5 transition-all bg-card/60 hover:bg-card"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Account
              </button>
              <button
                onClick={() => { signOutTeacher(); navigate("/"); }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border/50 hover:border-destructive/40 rounded-lg px-3 py-1.5 transition-all bg-card/60 hover:bg-card"
              >
                Sign Out
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            {getTeacherInfo()?.name ?? "Teacher Area"}
          </h1>
          <p className="text-muted-foreground text-lg">Manage your schedule and view student bookings.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab("slots")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-semibold transition-all",
              tab === "slots" ? "bg-primary text-primary-foreground shadow" : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
            )}
          >
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Time Slots</span>
          </button>
          <button
            onClick={() => setTab("calendar")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-semibold transition-all",
              tab === "calendar" ? "bg-primary text-primary-foreground shadow" : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
            )}
          >
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />Weekly Calendar
              {(bookings?.length ?? 0) > 0 && (
                <span className="ml-1 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">{bookings?.length}</span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab("applied")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-semibold transition-all",
              tab === "applied" ? "bg-primary text-primary-foreground shadow" : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
            )}
          >
            <span className="flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" />Applied Schedule
              {(bookings ?? []).some((b) => (b as any).assignedTime) && (
                <span className="ml-1 bg-green-500/20 text-green-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {(bookings ?? []).filter((b) => (b as any).assignedTime).length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab("schedule")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-semibold transition-all",
              tab === "schedule" ? "bg-primary text-primary-foreground shadow" : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
            )}
          >
            <span className="flex items-center gap-1.5">
              <Wand2 className="w-4 h-4" />Auto-Schedule
              {scheduleApplied && (
                <span className="ml-1 bg-green-500/20 text-green-600 text-xs px-1.5 py-0.5 rounded-full font-bold">Applied</span>
              )}
            </span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === "slots" && (
            <motion.div key="slots" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-foreground text-lg">Available Slots</h2>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Clear all bookings */}
                    {bookings && bookings.length > 0 && (
                      clearBookingsConfirm ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-amber-600 font-medium">Clear bookings?</span>
                          <button
                            onClick={handleClearBookings}
                            disabled={clearingBookings}
                            className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-md font-semibold disabled:opacity-60"
                          >
                            {clearingBookings ? "Clearing…" : "Yes, clear"}
                          </button>
                          <button onClick={() => setClearBookingsConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setClearBookingsConfirm(true); setDeleteAllConfirm(false); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-600 transition-colors px-2 py-1 rounded-lg hover:bg-amber-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear bookings
                        </button>
                      )
                    )}

                    {/* Delete all slots */}
                    {slots && slots.length > 0 && (
                      deleteAllConfirm ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-destructive font-medium">Delete all?</span>
                          <button
                            onClick={handleDeleteAll}
                            disabled={deletingAll}
                            className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded-md font-semibold disabled:opacity-60"
                          >
                            {deletingAll ? "Deleting…" : "Yes, delete all"}
                          </button>
                          <button onClick={() => setDeleteAllConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeleteAllConfirm(true); setClearBookingsConfirm(false); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete all
                        </button>
                      )
                    )}
                    <button
                      onClick={handleToggleBlockFromAppointments}
                      title={blockFromAppointments ? "Appointments block overlapping times — click to allow double-booking" : "Appointments are not blocking times — click to enforce exclusive slots"}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all",
                        blockFromAppointments
                          ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {blockFromAppointments ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      Appt. blocking
                    </button>
                    <button
                      onClick={handleToggleHideFullyBlocked}
                      title={hideFullyBlocked ? "Fully-blocked slots are hidden from students — click to show them" : "Fully-blocked slots are visible to students — click to hide them"}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all",
                        hideFullyBlocked
                          ? "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {hideFullyBlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      Auto-hide full
                    </button>
                    <button
                      onClick={() => setShowDurationDialog(true)}
                      title={
                        durationOptions !== null && durationOptions.length > 0
                          ? `Custom: ${durationOptions.map(o => o.label).join(", ")} — click to edit`
                          : durationOptions !== null && durationOptions.length === 0
                          ? "No durations selected — students cannot pick a duration (click to fix)"
                          : "Using default session durations — click to customise"
                      }
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all",
                        durationOptions !== null
                          ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                          : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
                      )}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Durations
                      {(() => {
                        const count = durationOptions !== null ? durationOptions.length : DURATION_OPTIONS.length;
                        return (
                          <span className={cn(
                            "ml-0.5 flex items-center justify-center text-[10px] font-bold rounded-full w-4 h-4 leading-none",
                            durationOptions !== null && durationOptions.length === 0
                              ? "bg-destructive/20 text-destructive"
                              : durationOptions !== null
                              ? "bg-violet-200 text-violet-800"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {count}
                          </span>
                        );
                      })()}
                    </button>
                    <div
                      title="Number of priority choices students must submit (1–5)"
                      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border bg-card text-muted-foreground border-border"
                    >
                      <button
                        onClick={() => handleSetNumChoices(numChoices - 1)}
                        disabled={numChoices <= 1}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                        aria-label="Decrease priority choices"
                      >
                        −
                      </button>
                      <span className="min-w-[52px] text-center text-foreground">
                        {numChoices} {numChoices === 1 ? "choice" : "choices"}
                      </span>
                      <button
                        onClick={() => handleSetNumChoices(numChoices + 1)}
                        disabled={numChoices >= 5}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                        aria-label="Increase priority choices"
                      >
                        +
                      </button>
                    </div>
                    <Button onClick={() => { setShowAddForm((v) => !v); setFormError(null); setDeleteAllConfirm(false); setClearBookingsConfirm(false); }} variant={showAddForm ? "outline" : "default"}>
                      <Plus className="w-4 h-4 mr-1.5" />{showAddForm ? "Cancel" : "Add Slot"}
                    </Button>
                  </div>
                </div>

                <AnimatePresence>
                  {showAddForm && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="bg-muted/30 rounded-xl p-4 mb-4 border border-border space-y-3">
                        <p className="text-sm font-semibold text-foreground mb-2">New Time Slot</p>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1 font-medium">Day of Week</label>
                          <select
                            value={form.day}
                            onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Select a day…</option>
                            {ALL_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1 font-medium">Start Time</label>
                            <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1 font-medium">End Time</label>
                            <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
                          </div>
                        </div>
                        {formError && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-4 h-4" />{formError}</p>}
                        <Button className="w-full" onClick={handleAddSlot} isLoading={createSlot.isPending}>Add Slot</Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}</div>
                ) : !slots?.length ? (
                  <div className="py-10 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <p className="font-medium">No time slots yet</p>
                    <p className="text-sm mt-1">Add one manually or use the AI assistant.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slots.map((slot) => {
                      const slotBookings = bookingsForSlot(slot.id);
                      const isDeleting = deleteConfirmId === slot.id;
                      const isExpanded = expandedSlotId === slot.id;
                      const hasBookings = slotBookings.length > 0;
                      const blockedTimes = slot.blockedTimes ?? [];
                      const appointmentRanges = new Set(
                        (bookings ?? [])
                          .filter(b => (b as any).assignedTime?.startsWith(`${slot.id}|`))
                          .map(b => { const at = (b as any).assignedTime as string; return at.slice(at.indexOf("|") + 1); })
                      );
                      const appointmentBlocks = blockedTimes.filter(bt => appointmentRanges.has(`${bt.start}-${bt.end}`));
                      const manualBlocks = blockedTimes.filter(bt => !appointmentRanges.has(`${bt.start}-${bt.end}`));
                      const hasBlocked = blockedTimes.length > 0;
                      const isExpandable = hasBookings || hasBlocked;
                      const fullyBlocked = blockFromAppointments && slot.available && isFullyBlocked(slot.startTime, slot.endTime, blockedTimes);
                      return (
                        <motion.div key={slot.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className={cn("rounded-xl border overflow-hidden transition-all", slot.available ? "bg-card border-border" : "bg-muted/50 border-dashed border-muted-foreground/40")}>
                          {!slot.available && (
                            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-muted-foreground/10 border-b border-dashed border-muted-foreground/20">
                              <EyeOff className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Hidden from students</span>
                            </div>
                          )}
                          {fullyBlocked && (
                            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-50 border-b border-orange-200/60">
                              <Ban className="w-3 h-3 text-orange-500 shrink-0" />
                              <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide">
                                Fully blocked — {hideFullyBlocked ? "hidden from students" : "visible to students"}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center p-4 gap-3">
                            <button type="button" disabled={!isExpandable} onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)} className={cn("shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors", isExpandable ? "hover:bg-muted cursor-pointer" : "cursor-default opacity-30")}>
                              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                            </button>
                            <div className="flex-1 min-w-0 cursor-pointer select-none" onClick={() => isExpandable && setExpandedSlotId(isExpanded ? null : slot.id)}>
                              <div className={cn("font-semibold text-sm truncate", slot.available ? "text-foreground" : "text-muted-foreground line-through")}>{slot.label}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{slot.startTime} – {slot.endTime}</span>
                                <span className={cn("flex items-center gap-1 font-medium", hasBookings ? "text-primary" : "text-muted-foreground")}>
                                  <Users className="w-3 h-3" />{slotBookings.length} {slotBookings.length === 1 ? "booking" : "bookings"}
                                </span>
                                {appointmentBlocks.length > 0 && (
                                  <span className="flex items-center gap-1 font-medium text-primary">
                                    <CheckCheck className="w-3 h-3" />{appointmentBlocks.length} {appointmentBlocks.length === 1 ? "appointment" : "appointments"}
                                  </span>
                                )}
                                {manualBlocks.length > 0 && (
                                  <span className="flex items-center gap-1 font-medium text-orange-500">
                                    <Ban className="w-3 h-3" />{manualBlocks.length} {manualBlocks.length === 1 ? "blocked" : "blocked"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => handleToggle(slot.id, slot.available)} title={slot.available ? "Hide from students" : "Show to students"} className="text-muted-foreground hover:text-foreground transition-colors">
                                {slot.available ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground/60" />}
                              </button>
                              {!isDeleting ? (
                                <button onClick={() => setDeleteConfirmId(slot.id)} title="Delete slot" className="text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-destructive font-medium">Delete?</span>
                                  <button onClick={() => handleDelete(slot.id)} className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded-md font-semibold">Yes</button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-muted-foreground hover:text-foreground">No</button>
                                </div>
                              )}
                            </div>
                          </div>
                          <AnimatePresence>
                            {isExpanded && isExpandable && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="border-t border-border mx-4 mb-3" />
                                <div className="px-4 pb-4 space-y-4">
                                  {appointmentBlocks.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <CheckCheck className="w-3 h-3 text-primary" /> Appointment Times
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {appointmentBlocks.map((bt, bti) => (
                                          <div key={bti} className="flex items-center gap-1.5 bg-primary/8 border border-primary/25 text-primary rounded-lg px-2.5 py-1 text-xs font-medium">
                                            <span>{fmt12(bt.start)} – {fmt12(bt.end)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {manualBlocks.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Ban className="w-3 h-3 text-orange-500" /> Blocked Times
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {manualBlocks.map((bt, bti) => {
                                          const globalIdx = blockedTimes.indexOf(bt);
                                          return (
                                            <div key={bti} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-2.5 py-1 text-xs font-medium">
                                              <span>{fmt12(bt.start)} – {fmt12(bt.end)}</span>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveBlockedTime(slot.id, globalIdx)}
                                                className="ml-0.5 text-orange-400 hover:text-orange-600 transition-colors"
                                                title="Remove blocked time"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {hasBookings && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Registered Students</p>
                                  {slotBookings.map((b, i) => (
                                    <motion.div key={b.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">{b.name.charAt(0).toUpperCase()}</div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><User className="w-3 h-3 text-muted-foreground shrink-0" /><span className="truncate">{b.name}</span></div>
                                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{b.email}</span></div>
                                        </div>
                                        <div className="text-xs text-muted-foreground shrink-0">{new Date(b.createdAt).toLocaleDateString()}</div>
                                      </div>
                                      <div className="pt-1 border-t border-border/40 space-y-1.5">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3 Priority Choices</p>
                                        <div className="flex flex-wrap gap-2">
                                          {[b.priority1, b.priority2, b.priority3].map((p, pi) => {
                                            const isMatch = priorityMatchesSlot(p, slot.id);
                                            return (
                                              <div key={pi} className={cn(
                                                "flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 border",
                                                isMatch
                                                  ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                                                  : "bg-background border-border/50 opacity-50"
                                              )}>
                                                <span className={cn("font-bold text-[10px] shrink-0 tabular-nums", PRIORITY_COLORS[pi])}>
                                                  {["1st", "2nd", "3rd"][pi]}
                                                </span>
                                                <span className="font-medium text-foreground">{fmtPriority(p, slots)}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </motion.div>
                                  ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {tab === "calendar" && (
            <motion.div key="calendar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <h2 className="font-bold text-foreground text-lg mb-4">Weekly Schedule & Bookings</h2>
                <WeeklyCalendar />
              </div>
            </motion.div>
          )}
          {tab === "applied" && (
            <motion.div key="applied" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-foreground text-lg flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />Applied Schedule
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Students currently assigned to their time slots. Click the pencil to reassign.</p>
                  </div>
                  {clearScheduleConfirm ? (
                    <div className="flex items-center gap-2 shrink-0 pt-1">
                      <span className="text-xs text-muted-foreground">Clear all?</span>
                      <button
                        onClick={async () => {
                          setIsClearingSchedule(true);
                          try {
                            await adminFetch(`${import.meta.env.BASE_URL}api/bookings/schedule`, { method: "DELETE" });
                            setSchedulePreview(null);
                            setScheduleSummary(null);
                            setScheduleApplied(false);
                            setClearScheduleConfirm(false);
                            setEditOverrides({});
                            setEditingRow(null);
                            setEditingAssignId(null);
                            refetchBookings();
                          } finally {
                            setIsClearingSchedule(false);
                          }
                        }}
                        disabled={isClearingSchedule}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 transition-all"
                      >
                        {isClearingSchedule ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Yes, clear"}
                      </button>
                      <button onClick={() => setClearScheduleConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setClearScheduleConfirm(true)}
                      className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground border border-border/60 px-3 py-1.5 rounded-lg hover:text-destructive hover:border-destructive/40 transition-all mt-1"
                    >
                      <RotateCcw className="w-3 h-3" />Clear
                    </button>
                  )}
                </div>
                {(() => {
                  type ExtBooking = (typeof bookings extends (infer T)[] | undefined ? T : never) & { assignedTime: string | null; assignedPriority: number | null };
                  const all = (bookings ?? []) as ExtBooking[];
                  const assigned = all.filter((b) => b.assignedTime);
                  const unassigned = all.filter((b) => !b.assignedTime);

                  const saveAssignment = async (bookingId: number) => {
                    if (!assignDraft.slotId || !assignDraft.start) return;
                    const draftSlot = (slots ?? []).find(s => s.id === assignDraft.slotId);
                    if (!draftSlot) return;
                    const durationMins = toMins(draftSlot.endTime) - toMins(draftSlot.startTime);
                    const endStr = fromMins(toMins(assignDraft.start) + durationMins);
                    // Detect if start matches one of the student's preferences
                    const bk = all.find(b => b.id === bookingId);
                    let assignedPriority: number | null = null;
                    if (bk) {
                      [bk.priority1, bk.priority2, bk.priority3].forEach((p, i) => {
                        if (!p) return;
                        const pipe = p.indexOf("|");
                        const prefSlotId = pipe !== -1 ? parseInt(p.slice(0, pipe), 10) : null;
                        const prefStart = pipe !== -1 ? p.slice(pipe + 1).split("-")[0] : null;
                        if (prefSlotId === assignDraft.slotId && prefStart === assignDraft.start && assignedPriority === null) {
                          assignedPriority = i + 1;
                        }
                      });
                    }
                    const assignedTime = `${assignDraft.slotId}|${assignDraft.start}-${endStr}`;
                    setIsSavingAssign(true);
                    try {
                      await adminFetch(`${import.meta.env.BASE_URL}api/bookings/${bookingId}/assignment`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ assignedTime, assignedPriority }),
                      });
                      setEditingAssignId(null);
                      refetchBookings();
                    } finally {
                      setIsSavingAssign(false);
                    }
                  };

                  const clearAssignment = async (bookingId: number) => {
                    setIsSavingAssign(true);
                    try {
                      await adminFetch(`${import.meta.env.BASE_URL}api/bookings/${bookingId}/assignment`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ assignedTime: null, assignedPriority: null }),
                      });
                      setEditingAssignId(null);
                      refetchBookings();
                    } finally {
                      setIsSavingAssign(false);
                    }
                  };

                  const startEdit = (b: ExtBooking) => {
                    if (b.assignedTime) {
                      const pipe = b.assignedTime.indexOf("|");
                      const slotId = parseInt(b.assignedTime.slice(0, pipe), 10);
                      const start = b.assignedTime.slice(pipe + 1).split("-")[0];
                      setAssignDraft({ slotId, start });
                    } else {
                      setAssignDraft({ slotId: null, start: null });
                    }
                    setEditingAssignId(b.id);
                  };

                  const EditPanel = ({ b }: { b: ExtBooking }) => {
                    const prefs = ([b.priority1, b.priority2, b.priority3] as (string | null | undefined)[]).filter(Boolean) as string[];
                    const canSave = assignDraft.slotId !== null && assignDraft.start !== null;
                    const LABELS = ["1st choice", "2nd choice", "3rd choice"];
                    return (
                      <div className="mt-2 pt-2 border-t border-border/40 space-y-2.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Student's preferences</p>
                        {prefs.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No preferences submitted.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {prefs.map((p, i) => {
                              const pipe = p.indexOf("|");
                              const slotId = parseInt(p.slice(0, pipe), 10);
                              const range = p.slice(pipe + 1);
                              const [start, end] = range.split("-");
                              const slot = (slots ?? []).find(s => s.id === slotId);
                              const sel = assignDraft.slotId === slotId && assignDraft.start === start;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setAssignDraft({ slotId, start })}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all text-left",
                                    sel ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"
                                  )}
                                >
                                  <span className={cn("text-[10px] font-bold uppercase tracking-wider shrink-0 w-16", sel ? "text-primary" : "text-muted-foreground")}>
                                    {LABELS[i]}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className={cn("font-semibold", sel ? "text-primary" : "text-foreground")}>{slot?.label ?? `Slot ${slotId}`}</span>
                                    <span className="text-muted-foreground ml-2 tabular-nums text-xs">{fmt12(start)} – {fmt12(end)}</span>
                                  </span>
                                  {sel && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            onClick={() => saveAssignment(b.id)}
                            disabled={!canSave || isSavingAssign}
                            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                          >
                            {isSavingAssign ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Save
                          </button>
                          {b.assignedTime && (
                            <button
                              onClick={() => clearAssignment(b.id)}
                              disabled={isSavingAssign}
                              className="flex items-center gap-1.5 text-xs text-destructive border border-destructive/30 px-3 py-1.5 rounded-lg font-semibold hover:bg-destructive/5 disabled:opacity-50 transition-all"
                            >
                              <X className="w-3 h-3" />Remove
                            </button>
                          )}
                          <button
                            onClick={() => setEditingAssignId(null)}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  };

                  if (all.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <Users className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-muted-foreground font-medium">No students have registered yet.</p>
                      </div>
                    );
                  }
                  if (assigned.length === 0 && unassigned.length > 0 && editingAssignId === null) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-muted-foreground font-medium">No schedule has been applied yet.</p>
                        <p className="text-sm text-muted-foreground/70">Run Auto-Schedule and click Apply to assign students.</p>
                        <button onClick={() => setTab("schedule")} className="mt-1 flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                          <Wand2 className="w-4 h-4" />Go to Auto-Schedule
                        </button>
                      </div>
                    );
                  }
                  const groups = new Map<number, { slotLabel: string; day: string; timeRange: string; students: ExtBooking[] }>();
                  for (const b of assigned) {
                    const pipe = b.assignedTime!.indexOf("|");
                    const slotId = parseInt(b.assignedTime!.slice(0, pipe), 10);
                    const timeRange = b.assignedTime!.slice(pipe + 1);
                    const slot = (slots ?? []).find((s) => s.id === slotId);
                    const slotLabel = slot?.label ?? `Slot ${slotId}`;
                    const day = dayOfSlot(slotLabel);
                    if (!groups.has(slotId)) groups.set(slotId, { slotLabel, day, timeRange, students: [] });
                    groups.get(slotId)!.students.push(b);
                  }
                  const sorted = [...groups.values()].sort((a, b) => {
                    const di = ALL_DAYS.indexOf(a.day) - ALL_DAYS.indexOf(b.day);
                    return di !== 0 ? di : a.timeRange.localeCompare(b.timeRange);
                  });

                  const StudentCard = ({ b, bg }: { b: ExtBooking; bg?: string }) => {
                    const isEditing = editingAssignId === b.id;
                    return (
                      <div className={cn("p-2.5 rounded-lg border border-border/40 space-y-0", bg ?? "bg-muted/30")}>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                            {b.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{b.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{b.email}</div>
                          </div>
                          {!isEditing && b.assignedTime && (() => {
                            const range = b.assignedTime.slice(b.assignedTime.indexOf("|") + 1);
                            const [start, end] = range.split("-");
                            return (
                              <span className="text-xs font-semibold text-muted-foreground shrink-0 tabular-nums">
                                {fmt12(start)} – {fmt12(end)}
                              </span>
                            );
                          })()}
                          <button
                            onClick={() => isEditing ? setEditingAssignId(null) : startEdit(b)}
                            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                            title={isEditing ? "Cancel edit" : "Reassign"}
                          >
                            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {isEditing && <EditPanel b={b} />}
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {sorted.map(({ slotLabel, students }) => (
                        <div key={slotLabel} className="rounded-xl border border-border bg-card p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                            <span className="font-semibold text-sm text-foreground">{slotLabel}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{students.length} student{students.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="space-y-2">
                            {students.map((b) => <StudentCard key={b.id} b={b} />)}
                          </div>
                        </div>
                      ))}
                      {unassigned.length > 0 && (
                        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            <span className="font-semibold text-sm text-muted-foreground">Unassigned</span>
                            <span className="ml-auto text-xs text-muted-foreground">{unassigned.length} student{unassigned.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="space-y-2">
                            {unassigned.map((b) => <StudentCard key={b.id} b={b} bg="bg-background" />)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
          {tab === "schedule" && (
            <motion.div key="schedule" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5 space-y-5">
                {/* Header */}
                <div>
                  <h2 className="font-bold text-foreground text-lg flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-primary" />Auto-Schedule Students
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Assigns each student to their highest available preference. When two students want the same slot, the earlier submission wins — or let AI apply your custom rules.
                  </p>
                </div>

                {/* Slot Capacities Panel */}
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold text-foreground">Students per Slot</span>
                    <div className="ml-auto flex items-center gap-2">
                      {/* Min stepper */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">min</span>
                        <button
                          type="button"
                          disabled={minStudentsPerSlot <= 1}
                          onClick={() => handleSetMinStudentsPerSlot(minStudentsPerSlot - 1)}
                          className="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-medium"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums text-foreground">
                          {minStudentsPerSlot}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSetMinStudentsPerSlot(minStudentsPerSlot + 1)}
                          className="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-base font-medium"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-muted-foreground text-sm font-medium">–</span>
                      {/* Max stepper */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">max</span>
                        <button
                          type="button"
                          disabled={maxStudentsPerSlot <= 1}
                          onClick={() => handleSetMaxStudentsPerSlot(maxStudentsPerSlot - 1)}
                          className="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-medium"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums text-foreground">
                          {maxStudentsPerSlot}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSetMaxStudentsPerSlot(maxStudentsPerSlot + 1)}
                          className="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-base font-medium"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Preferences Panel */}
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground">AI Scheduling Preferences</span>
                    <span className="text-xs text-muted-foreground ml-auto">Tell the AI how to prioritise students</span>
                  </div>
                  <textarea
                    value={aiPreferences}
                    onChange={(e) => setAiPreferences(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiSchedule(); }}
                    placeholder={`e.g. "Prioritise students who submitted late" · "Give priority to Alice and Bob" · "Randomise the order" · "Favour students who only got 3rd choice last time"`}
                    disabled={isAiScheduling || (bookings?.length ?? 0) === 0}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 transition-all"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">⌘↵ to run · AI reads names, emails, submission times and preferences</p>
                    <button
                      onClick={handleAiSchedule}
                      disabled={isAiScheduling || !aiPreferences.trim() || (bookings?.length ?? 0) === 0}
                      className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                      {isAiScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isAiScheduling ? "AI thinking…" : "Run with AI"}
                    </button>
                  </div>
                </div>

                {/* AI Reasoning display */}
                <AnimatePresence>
                  {(aiReasoning || isAiScheduling) && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="rounded-xl border border-border bg-muted/30 p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Bot className="w-3.5 h-3.5 text-primary" />AI Reasoning
                        {isAiScheduling && <Loader2 className="w-3 h-3 animate-spin ml-1 text-primary" />}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {aiReasoning || <span className="text-muted-foreground italic">Analysing preferences…</span>}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or run without AI</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Standard Run Preview */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Standard greedy — earlier submission wins ties</p>
                  <button
                    onClick={async () => {
                      setIsScheduling(true);
                      setScheduleApplied(false);
                      setAiReasoning(null);
                      setAiReasoningSummary(null);
                      setScheduleIsAiGenerated(false);
                      setEditOverrides({});
                      setEditingRow(null);
                      try {
                        const res = await adminFetch(`${import.meta.env.BASE_URL}api/bookings/auto-schedule`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ apply: false }),
                        });
                        const data = await res.json();
                        setSchedulePreview(data.results);
                        setScheduleSummary(data.summary);
                      } finally {
                        setIsScheduling(false);
                      }
                    }}
                    disabled={isScheduling || isAiScheduling || (bookings?.length ?? 0) === 0}
                    className="shrink-0 flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-muted/50 disabled:opacity-50 transition-all"
                  >
                    {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isScheduling ? "Computing…" : "Run Preview"}
                  </button>
                </div>

                {(bookings?.length ?? 0) === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                    {scheduleApplied ? "No appointments yet." : "No student bookings yet. Students need to submit their preferences first."}
                  </div>
                )}

                {effectiveSummary && effectivePreview && (
                  <>
                    {/* Summary badges */}
                    <div className="flex flex-wrap gap-2">
                      {scheduleIsAiGenerated && (
                        <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full border bg-primary/10 text-primary border-primary/30">
                          <Sparkles className="w-3 h-3" />AI-Ordered
                        </span>
                      )}
                      {[
                        { label: "1st choice", value: effectiveSummary.got1st, color: "bg-green-500/15 text-green-700 border-green-500/30" },
                        { label: "2nd choice", value: effectiveSummary.got2nd, color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
                        { label: "3rd choice", value: effectiveSummary.got3rd, color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
                        { label: "Unassigned", value: effectiveSummary.unassigned, color: "bg-red-500/15 text-red-700 border-red-500/30" },
                      ].map(b => (
                        <span key={b.label} className={cn("text-xs font-semibold px-3 py-1 rounded-full border", b.color)}>
                          {b.value} got {b.label}
                        </span>
                      ))}
                      <span className={cn("text-xs font-semibold px-3 py-1 rounded-full border", effectiveSummary.totalScore >= 0 ? "bg-violet-500/15 text-violet-700 border-violet-500/30" : "bg-red-500/15 text-red-700 border-red-500/30")}>
                        Score: {effectiveSummary.totalScore > 0 ? "+" : ""}{effectiveSummary.totalScore}
                      </span>
                      <span className="text-xs text-muted-foreground self-center ml-1">
                        {hasUnsavedEdits ? "· Edited — not saved yet" : scheduleApplied ? "· Schedule applied to database" : "· Preview only — not saved yet"}
                      </span>
                    </div>

                    {/* AI reasoning summary */}
                    {scheduleIsAiGenerated && aiReasoningSummary && (
                      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                        <Bot className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">{aiReasoningSummary}</p>
                      </div>
                    )}

                    {/* Results table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Student</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Assigned Slot</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Time</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Got</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Edit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {effectivePreview.map((r, i) => {
                            const originalRow = schedulePreview!.find(s => s.bookingId === r.bookingId)!;
                            const [tStart, tEnd] = (r.assignedTimeRange ?? "").split("-");
                            const priorityLabels: Record<number, { label: string; cls: string }> = {
                              1: { label: "1st", cls: "bg-green-500/15 text-green-700 border-green-500/30" },
                              2: { label: "2nd", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
                              3: { label: "3rd", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
                            };
                            const badge = r.assignedPriority ? priorityLabels[r.assignedPriority] : null;
                            const isEditing = editingRow === r.bookingId;
                            const isOverridden = editOverrides[r.bookingId] !== undefined;
                            return (
                              <tr key={r.bookingId} className={cn("transition-colors", i % 2 === 0 ? "bg-background/40" : "bg-background/20", isOverridden && "ring-1 ring-inset ring-primary/30")}>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">{r.name}</div>
                                  <div className="text-xs text-muted-foreground">{r.email}</div>
                                </td>
                                {isEditing ? (
                                  <td colSpan={2} className="px-3 py-2">
                                    <select
                                      autoFocus
                                      className="w-full text-sm rounded-lg border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                      value={r.assignedTime ?? "unassigned"}
                                      onChange={e => {
                                        const val = e.target.value;
                                        if (val === "unassigned") {
                                          setEditOverrides(prev => ({ ...prev, [r.bookingId]: { assignedPriority: null, assignedTime: null, assignedSlotLabel: null, assignedTimeRange: null } }));
                                        } else {
                                          const pref = originalRow.preferences.find(p => p.assignedTime === val);
                                          if (pref) setEditOverrides(prev => ({ ...prev, [r.bookingId]: { assignedPriority: pref.priority, assignedTime: pref.assignedTime, assignedSlotLabel: pref.slotLabel, assignedTimeRange: pref.timeRange } }));
                                        }
                                        setEditingRow(null);
                                        setScheduleApplied(false);
                                      }}
                                    >
                                      {originalRow.preferences.map(pref => {
                                        const [ps, pe] = pref.timeRange.split("-");
                                        return (
                                          <option key={pref.priority} value={pref.assignedTime}>
                                            {pref.priority === 1 ? "1st" : pref.priority === 2 ? "2nd" : "3rd"} choice — {pref.slotLabel} {fmt12(ps)}–{fmt12(pe)}
                                          </option>
                                        );
                                      })}
                                      <option value="unassigned">Unassigned</option>
                                    </select>
                                  </td>
                                ) : (
                                  <>
                                    <td className="px-3 py-2 text-foreground">
                                      {r.assignedSlotLabel ?? <span className="text-muted-foreground italic">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-foreground tabular-nums">
                                      {tStart && tEnd
                                        ? `${fmt12(tStart)} – ${fmt12(tEnd)}`
                                        : <span className="text-muted-foreground italic">—</span>}
                                    </td>
                                  </>
                                )}
                                <td className="px-3 py-2 text-center">
                                  {badge
                                    ? <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", badge.cls)}>{badge.label}</span>
                                    : <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-700 border-red-500/30">None</span>
                                  }
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {isEditing ? (
                                    <button onClick={() => setEditingRow(null)} className="text-muted-foreground hover:text-foreground transition-colors" title="Cancel edit">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <button onClick={() => setEditingRow(r.bookingId)} className={cn("transition-colors", isOverridden ? "text-primary" : "text-muted-foreground hover:text-foreground")} title="Edit assignment">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={async () => {
                          if (!effectivePreview) return;
                          setIsApplyingSchedule(true);
                          try {
                            await adminFetch(`${import.meta.env.BASE_URL}api/bookings/apply-schedule`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                results: effectivePreview.map(r => ({
                                  bookingId: r.bookingId,
                                  assignedPriority: r.assignedPriority,
                                  assignedTime: r.assignedTime,
                                })),
                              }),
                            });
                            setScheduleApplied(true);
                            setEditOverrides({});
                            refetchBookings();
                            queryClient.invalidateQueries({ queryKey: ["teacher-slots", teacherSlug] });
                          } finally {
                            setIsApplyingSchedule(false);
                          }
                        }}
                        disabled={isApplyingSchedule || (scheduleApplied && !hasUnsavedEdits)}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-all"
                      >
                        {isApplyingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                        {scheduleApplied && !hasUnsavedEdits ? "Schedule Applied" : "Apply Schedule"}
                      </button>

                      {clearScheduleConfirm ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Clear all assignments?</span>
                          <button
                            onClick={async () => {
                              setIsClearingSchedule(true);
                              try {
                                await adminFetch(`${import.meta.env.BASE_URL}api/bookings/schedule`, { method: "DELETE" });
                                setSchedulePreview(null);
                                setScheduleSummary(null);
                                setScheduleApplied(false);
                                setClearScheduleConfirm(false);
                                setEditOverrides({});
                                setEditingRow(null);
                                refetchBookings();
                              } finally {
                                setIsClearingSchedule(false);
                              }
                            }}
                            disabled={isClearingSchedule}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
                          >
                            {isClearingSchedule ? "Clearing…" : "Yes, clear"}
                          </button>
                          <button onClick={() => setClearScheduleConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setClearScheduleConfirm(true)}
                          className="flex items-center gap-2 border border-border text-muted-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:text-destructive hover:border-destructive/40 transition-all"
                        >
                          <RotateCcw className="w-4 h-4" />Clear Schedule
                        </button>
                      )}
                    </div>
                  </>
                )}


              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AiAssistant
        slots={(slots ?? []).map((s) => ({ ...s, blockedTimes: s.blockedTimes ?? [] }))}
        onSlotsCreated={() => { refetchSlots(); refetchBookings(); setTab("slots"); }}
      />

      {/* ── Window-level scroll cue ── */}
      <AnimatePresence>
        {showScrollCue && (
          <motion.div
            key="scroll-cue"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            onClick={() => window.scrollBy({ top: 300, behavior: "smooth" })}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 cursor-pointer"
          >
            <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-wide uppercase bg-background/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-border/40">
              Scroll for more
            </span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              className="text-primary/70"
            >
              <svg className="w-5 h-5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
