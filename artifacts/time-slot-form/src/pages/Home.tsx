import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowRight, ArrowLeft, Check,
  User, Mail, Clock, CalendarDays, Timer, GraduationCap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCreateBooking } from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmt12, fromMins, toMins } from "@/lib/booking-utils";

type ApiSlot = {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
  blockedTimes: { start: string; end: string }[] | null;
};

type TeacherSlotData = {
  teacher: { id: number; name: string; slug: string; subject: string | null };
  slots: ApiSlot[];
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Choice = {
  slotId: number | null;
  duration: number | null;
  isCustomDuration: boolean;
  customDurationStr: string;
  start: string | null;
  isCustomTime: boolean;
  customTimeStr: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_LABELS = ["1st", "2nd", "3rd"] as const;

const PRIORITY_COLORS = [
  "bg-amber-500/15 text-amber-700 border-amber-400/40",
  "bg-blue-500/15 text-blue-700 border-blue-400/40",
  "bg-slate-500/15 text-slate-700 border-slate-400/40",
] as const;

const DURATION_OPTIONS = [
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
];

const TOTAL_PAGES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateStartTimes(
  slotStart: string,
  slotEnd: string,
  durationMins: number,
  blockedTimes: { start: string; end: string }[],
): string[] {
  const winStart = toMins(slotStart);
  const winEnd = toMins(slotEnd);
  const STEP = 15;
  const seen = new Set<string>();
  const times: string[] = [];
  for (let t = winStart; t + durationMins <= winEnd; t += STEP) {
    const tEnd = t + durationMins;
    const blocked = blockedTimes.some(
      bt => t < toMins(bt.end) && tEnd > toMins(bt.start),
    );
    if (!blocked) {
      const s = fromMins(t);
      if (!seen.has(s)) { seen.add(s); times.push(s); }
    }
  }
  return times;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { slug } = useParams<{ slug: string }>();
  const { data: teacherData, isLoading, isError } = useQuery<TeacherSlotData>({
    queryKey: ["teacher-slots", slug],
    queryFn: async () => {
      const res = await fetch(`/api/teachers/${slug}/timeslots`);
      if (!res.ok) throw new Error("Teacher not found");
      return res.json() as Promise<TeacherSlotData>;
    },
    enabled: !!slug,
  });
  const createBooking = useCreateBooking();
  const teacher = teacherData?.teacher;
  const slots = teacherData?.slots ?? [];

  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const [choices, setChoices] = useState<Choice[]>([
    { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
    { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
    { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
  ]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [detailsErrors, setDetailsErrors] = useState<{ name?: string; email?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showScrollCue, setShowScrollCue] = useState(false);
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
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [page]);

  const availableSlots = (slots ?? []).filter(s => s.available);

  const isDetails = page === 9;
  const choiceIdx = Math.min(Math.floor(page / 3), 2);
  const subPage = isDetails ? -1 : page % 3;

  const updateChoice = (idx: number, updates: Partial<Choice>) =>
    setChoices(prev => prev.map((c, i) => i === idx ? { ...c, ...updates } : c));

  const getEffectiveDuration = (c: Choice): number | null => {
    if (c.isCustomDuration) {
      const n = parseInt(c.customDurationStr, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return c.duration;
  };

  const validateCustomTime = (
    start: string,
    slotStart: string,
    slotEnd: string,
    dur: number,
    blockedTimes: { start: string; end: string }[],
  ): string | null => {
    const startMins = toMins(start);
    const endMins = startMins + dur;
    if (startMins < toMins(slotStart))
      return `Start time must be at or after ${fmt12(slotStart)}.`;
    if (endMins > toMins(slotEnd))
      return `Session would end at ${fmt12(fromMins(endMins))}, after the slot closes at ${fmt12(slotEnd)}.`;
    const isBlocked = blockedTimes.some(bt => startMins < toMins(bt.end) && endMins > toMins(bt.start));
    if (isBlocked)
      return "That time overlaps with a blocked period. Please choose a different time.";
    return null;
  };

  const canGoNext = (): boolean => {
    if (page >= TOTAL_PAGES - 1) return false;
    const c = choices[choiceIdx];
    if (subPage === 0) return c.slotId !== null;
    if (subPage === 1) {
      const d = getEffectiveDuration(c);
      if (d === null || d <= 0 || d > (slotWindowMins ?? 480)) return false;
      if (slotWindowMins !== null && d > slotWindowMins) return false;
      return true;
    }
    if (subPage === 2) {
      if (c.start === null) return false;
      if (c.isCustomTime && currentSlot && currentDur) {
        const err = validateCustomTime(c.start, currentSlot.startTime, currentSlot.endTime, currentDur, currentSlot.blockedTimes ?? []);
        if (err) return false;
      }
      return true;
    }
    return false;
  };

  const goNext = () => { setDirection(1); setPage(p => Math.min(p + 1, TOTAL_PAGES - 1)); };
  const goBack = () => { setDirection(-1); setPage(p => Math.max(p - 1, 0)); };

  const handleSubmit = () => {
    const errs: typeof detailsErrors = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Please enter a valid email";
    if (Object.keys(errs).length) { setDetailsErrors(errs); return; }

    const priorities = choices.map(c => {
      const dur = getEffectiveDuration(c)!;
      const end = fromMins(toMins(c.start!) + dur);
      return `${c.slotId}|${c.start}-${end}`;
    });

    setSubmitError(null);
    createBooking.mutate({
      data: {
        timeSlotId: choices[0].slotId!,
        name: name.trim(),
        email: email.trim(),
        priority1: priorities[0],
        priority2: priorities[1],
        priority3: priorities[2],
      },
    }, {
      onSuccess: d => {
        setConfirmedBooking(d);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      onError: (err: unknown) => {
        // Prefer the server's JSON `message` field if available
        const serverMsg = (err as { data?: { message?: string } })?.data?.message;
        const msg =
          serverMsg ??
          (err instanceof Error
            ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, "")
            : typeof err === "string" ? err : null) ??
          "Something went wrong. Please try again.";
        setSubmitError(msg);
      },
    });
  };

  const currentC = choices[choiceIdx];
  const currentSlot = availableSlots.find(s => s.id === currentC?.slotId);
  const currentDur = currentC ? getEffectiveDuration(currentC) : null;
  const slotWindowMins = currentSlot
    ? toMins(currentSlot.endTime) - toMins(currentSlot.startTime)
    : null;
  const timeOptions = currentSlot && currentDur
    ? generateStartTimes(currentSlot.startTime, currentSlot.endTime, currentDur, currentSlot.blockedTimes ?? [])
    : [];

  const progressPct = ((page + 1) / TOTAL_PAGES) * 100;

  const subPageLabel = isDetails
    ? "Your details"
    : ["Which day?", "How long?", "What time?"][subPage] ?? "";

  const pageVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * 50 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -50 }),
  };

  return (
    <div className="relative min-h-screen flex items-start justify-center py-8 px-4 sm:px-6 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative w-full max-w-lg mx-auto z-10">
        <div className="flex justify-between items-center mb-3">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            ← All Teachers
          </Link>
          <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Teacher Sign In →
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {!confirmedBooking ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
              className="bg-card/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden"
            >
              {/* ── Header / progress ── */}
              <div className="bg-primary/5 border-b border-border/40 px-6 sm:px-8 pt-6 pb-4">
                {teacher && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">{teacher.name}</span>
                      {teacher.subject && (
                        <span className="text-xs text-muted-foreground ml-1.5">· {teacher.subject}</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-primary/70 uppercase tracking-widest">Session Booking</p>
                    <h1 className="text-lg font-bold text-foreground mt-0.5">
                      {isDetails
                        ? "Almost done — your details"
                        : `${PRIORITY_LABELS[choiceIdx]} preference · ${subPageLabel}`}
                    </h1>
                  </div>
                  <span className="text-sm font-bold text-muted-foreground tabular-nums">
                    {page + 1}<span className="font-normal">/{TOTAL_PAGES}</span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={false}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>

                {/* Step pills */}
                <div className="flex gap-1 mt-2.5">
                  {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 rounded-full flex-1 transition-all duration-300",
                        i <= page ? "bg-primary/70" : "bg-muted",
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* ── Page body ── */}
              <div className="min-h-[320px]">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={page}
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="px-6 sm:px-8 py-6 space-y-5"
                  >

                    {/* ────── DAY PICKER (subPage === 0) ────── */}
                    {subPage === 0 && !isDetails && (
                      <>
                        <div>
                          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-primary" />
                            Which day works best?
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Select an availability block for your {PRIORITY_LABELS[choiceIdx]} choice.
                          </p>
                        </div>

                        {isLoading ? (
                          <div className="space-y-2">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                            ))}
                          </div>
                        ) : isError ? (
                          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-center">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Failed to load available times. Please refresh.
                          </div>
                        ) : availableSlots.length === 0 ? (
                          <div className="p-6 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground text-sm">
                            No availability right now. Please check back later.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {availableSlots.map(slot => {
                              const sel = currentC.slotId === slot.id;
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => updateChoice(choiceIdx, { slotId: slot.id, duration: null, start: null })}
                                  className={cn(
                                    "w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 text-left transition-all",
                                    sel
                                      ? "border-primary bg-primary/10"
                                      : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5",
                                  )}
                                >
                                  <div>
                                    <div className={cn("font-semibold text-sm", sel ? "text-primary" : "text-foreground")}>
                                      {slot.label}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                                    </div>
                                  </div>
                                  <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                    sel ? "bg-primary border-primary" : "border-muted-foreground/30",
                                  )}>
                                    {sel && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {/* ────── DURATION PICKER (subPage === 1) ────── */}
                    {subPage === 1 && !isDetails && (() => {
                      const c = choices[choiceIdx];
                      const dur = getEffectiveDuration(c);
                      const overWindow = slotWindowMins !== null && dur !== null && dur > slotWindowMins;
                      return (
                        <>
                          <div>
                            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                              <Timer className="w-4 h-4 text-primary" />
                              How long do you need?
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              Choose a session duration for your {PRIORITY_LABELS[choiceIdx]} choice.{" "}
                              {slotWindowMins !== null && (
                                <span className="font-medium text-foreground">
                                  Available window: {slotWindowMins} min.
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {DURATION_OPTIONS.map(opt => {
                              const sel = !c.isCustomDuration && c.duration === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => updateChoice(choiceIdx, { duration: opt.value, isCustomDuration: false, start: null })}
                                  className={cn(
                                    "py-3 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-0.5",
                                    sel
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() => updateChoice(choiceIdx, { isCustomDuration: true, duration: null, start: null })}
                              className={cn(
                                "py-3 rounded-xl border-2 text-sm font-semibold transition-all col-span-3",
                                c.isCustomDuration
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
                              )}
                            >
                              Other (enter minutes)
                            </button>
                          </div>

                          {c.isCustomDuration && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="space-y-1"
                            >
                              <label className="text-sm font-medium text-foreground">
                                Duration in minutes
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={slotWindowMins ?? 480}
                                value={c.customDurationStr}
                                onChange={e => updateChoice(choiceIdx, { customDurationStr: e.target.value, start: null })}
                                placeholder="e.g. 25"
                                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                                autoFocus
                              />
                            </motion.div>
                          )}

                          {overWindow && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex gap-2 items-start"
                            >
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                              <span>
                                <span className="font-semibold">{dur} min</span> exceeds this slot's total window of{" "}
                                <span className="font-semibold">{slotWindowMins} min</span>{" "}
                                ({currentSlot && `${fmt12(currentSlot.startTime)} – ${fmt12(currentSlot.endTime)}`}).{" "}
                                Please choose a shorter duration or go back and pick a different day.
                              </span>
                            </motion.div>
                          )}
                        </>
                      );
                    })()}

                    {/* ────── TIME PICKER (subPage === 2) ────── */}
                    {subPage === 2 && !isDetails && (() => {
                      const c = choices[choiceIdx];
                      const slot = availableSlots.find(s => s.id === c.slotId);
                      const dur = getEffectiveDuration(c);
                      const times = slot && dur
                        ? generateStartTimes(slot.startTime, slot.endTime, dur, slot.blockedTimes ?? [])
                        : [];
                      // Times already chosen in other preferences for the same slot
                      const alreadyPicked = new Set(
                        choices
                          .filter((_, i) => i !== choiceIdx)
                          .filter(ch => ch.slotId === c.slotId && ch.start !== null)
                          .map(ch => ch.start!)
                      );
                      const customTimeError = c.isCustomTime && c.customTimeStr && slot && dur
                        ? validateCustomTime(c.customTimeStr, slot.startTime, slot.endTime, dur, slot.blockedTimes ?? [])
                        : null;

                      return (
                        <>
                          <div>
                            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                              <Clock className="w-4 h-4 text-primary" />
                              What time works for you?
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              Available window: {slot ? `${fmt12(slot.startTime)} – ${fmt12(slot.endTime)}` : "—"}.{" "}
                              Session is <span className="font-semibold text-foreground">{dur} min</span>.
                            </p>
                          </div>

                          {times.length === 0 ? (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm flex gap-2 items-start">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>
                                No available start times for that duration. Go back and choose a shorter session or a different day.
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
                                {times.map(t => {
                                const endStr = fromMins(toMins(t) + dur!);
                                const sel = c.start === t;
                                const taken = alreadyPicked.has(t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={taken}
                                    onClick={() => !taken && updateChoice(choiceIdx, { start: t })}
                                    title={taken ? "Already chosen as another preference" : undefined}
                                    className={cn(
                                      "flex flex-col items-center px-3.5 py-2.5 rounded-xl border-2 transition-all",
                                      taken
                                        ? "border-border/30 bg-muted/40 text-muted-foreground/40 cursor-not-allowed line-through"
                                        : sel
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
                                    )}
                                  >
                                    <span className="text-sm font-bold">{fmt12(t)}</span>
                                    <span className="text-[10px]">{taken ? "chosen" : `to ${fmt12(endStr)}`}</span>
                                  </button>
                                );
                              })}
                              </div>

                              <button
                              type="button"
                              onClick={() => updateChoice(choiceIdx, { isCustomTime: true, start: null })}
                              className={cn(
                                "w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                                c.isCustomTime
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
                              )}
                            >
                              Other (enter time)
                            </button>

                            {c.isCustomTime && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="space-y-2"
                              >
                                <label className="text-sm font-medium text-foreground">
                                  Start time
                                </label>
                                <input
                                  type="time"
                                  value={c.customTimeStr}
                                  onChange={e => updateChoice(choiceIdx, { customTimeStr: e.target.value, start: null })}
                                  className={cn(
                                    "w-full text-sm bg-background border rounded-xl px-3 py-2.5 outline-none focus:ring-2 transition-all",
                                    customTimeError
                                      ? "border-destructive/60 focus:ring-destructive/20 focus:border-destructive/60"
                                      : "border-border focus:ring-primary/30 focus:border-primary/50",
                                  )}
                                  autoFocus
                                />
                                {customTimeError && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-start gap-2 p-3 rounded-xl bg-destructive/8 border border-destructive/25 text-destructive text-sm"
                                  >
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    {customTimeError}
                                  </motion.div>
                                )}
                              </motion.div>
                            )}

                          {c.isCustomTime && c.customTimeStr && (
                            <button
                              type="button"
                              disabled={!!customTimeError}
                              onClick={() => !customTimeError && updateChoice(choiceIdx, { start: c.customTimeStr })}
                              className={cn(
                                "w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                                customTimeError
                                  ? "border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
                                  : c.start === c.customTimeStr
                                    ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
                                    : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
                              )}
                            >
                              {customTimeError
                                ? "Fix the time above to continue"
                                : c.start === c.customTimeStr
                                  ? `✓ Confirmed: ${fmt12(c.customTimeStr)}`
                                  : `Confirm: ${fmt12(c.customTimeStr)}`}
                            </button>
                          )}
                            </>
                          )}
                        </>
                      );
                    })()}

                    {/* ────── DETAILS PAGE (page === 9) ────── */}
                    {isDetails && (
                      <>
                        <div>
                          <h2 className="text-base font-bold text-foreground">Almost done!</h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Enter your details and we'll confirm your booking based on your preferences.
                          </p>
                        </div>

                        {/* Summary */}
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Your 3 preferences
                          </p>
                          {choices.map((c, i) => {
                            const slot = availableSlots.find(s => s.id === c.slotId);
                            const dur = getEffectiveDuration(c);
                            const endStr = c.start && dur ? fromMins(toMins(c.start) + dur) : null;
                            return (
                              <div key={i} className="flex items-center gap-2.5 text-sm">
                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border shrink-0", PRIORITY_COLORS[i])}>
                                  {PRIORITY_LABELS[i]}
                                </span>
                                <span className="font-medium text-foreground truncate">{slot?.label ?? "—"}</span>
                                {c.start && endStr && (
                                  <span className="text-muted-foreground text-xs shrink-0">
                                    {fmt12(c.start)} – {fmt12(endStr)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                              <User className="w-4 h-4 text-muted-foreground" />Full Name
                            </label>
                            <Input
                              value={name}
                              onChange={e => { setName(e.target.value); setDetailsErrors(p => ({ ...p, name: undefined })); }}
                              placeholder="Jane Doe"
                              maxLength={40}
                              error={!!detailsErrors.name}
                            />
                            {detailsErrors.name && (
                              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />{detailsErrors.name}
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                              <Mail className="w-4 h-4 text-muted-foreground" />Email Address
                            </label>
                            <Input
                              type="email"
                              value={email}
                              onChange={e => { setEmail(e.target.value); setDetailsErrors(p => ({ ...p, email: undefined })); }}
                              placeholder="jane@example.com"
                              maxLength={40}
                              error={!!detailsErrors.email}
                            />
                            {detailsErrors.email && (
                              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />{detailsErrors.email}
                              </p>
                            )}
                          </div>
                        </div>

                        {(createBooking.isError || submitError) && (
                          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-start">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{submitError ?? "Failed to submit. Please try again."}</span>
                          </div>
                        )}
                      </>
                    )}

                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── Navigation footer ── */}
              <div className="px-6 sm:px-8 pb-6 pt-3 border-t border-border/30 flex items-center justify-between">
                {page > 0 ? (
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted/50"
                  >
                    <ArrowLeft className="w-4 h-4" />Back
                  </button>
                ) : <div />}

                {!isDetails ? (
                  <button
                    onClick={goNext}
                    disabled={!canGoNext()}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={createBooking.isPending}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-all"
                  >
                    {createBooking.isPending ? "Submitting…" : "Submit Request"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>

          ) : (
            /* ── Success view ── */
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
              className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 p-8 sm:p-12 text-center"
            >
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                <img
                  src={`${import.meta.env.BASE_URL}images/success-calendar.png`}
                  alt="Request Sent"
                  className="w-36 h-36 mx-auto mb-6 drop-shadow-2xl"
                />
              </motion.div>

              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-display font-bold text-foreground mb-3"
              >
                Request Sent!
              </motion.h2>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-lg text-muted-foreground mb-8"
              >
                Thanks, <span className="font-semibold text-foreground">{confirmedBooking.name}</span>!
                Your preferences have been recorded.
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-border/50 text-left max-w-sm mx-auto space-y-3"
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Preferences</p>
                {choices.map((c, i) => {
                  const slot = availableSlots.find(s => s.id === c.slotId);
                  const dur = getEffectiveDuration(c);
                  const endStr = c.start && dur ? fromMins(toMins(c.start) + dur) : null;
                  return (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border shrink-0", PRIORITY_COLORS[i])}>
                        {PRIORITY_LABELS[i]}
                      </span>
                      <div>
                        <div className="font-semibold text-foreground">{slot?.label ?? "—"}</div>
                        {c.start && endStr && (
                          <div className="text-xs text-muted-foreground">{fmt12(c.start)} – {fmt12(endStr)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-6 text-sm text-muted-foreground"
              >
                The teacher will review your preferences and confirm a time.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 cursor-pointer"
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
