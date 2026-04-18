import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowRight, ArrowLeft, Check, CheckCircle2,
  User, Mail, Clock, CalendarDays, Timer, GraduationCap, Pencil, ChevronDown,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  hideWhenFull: boolean;
  blockedTimes: { start: string; end: string }[] | null;
  bookedSessions: { start: string; end: string; name: string }[];
};

type TeacherSlotData = {
  teacher: { id: number; name: string; slug: string; subject: string | null; hideFullyBlocked?: boolean };
  slots: ApiSlot[];
  unassignedStudents?: { name: string }[];
  unschedulableStudents?: { name: string }[];
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
  return generateAllStartTimes(slotStart, slotEnd, durationMins, blockedTimes)
    .filter(t => !t.blocked)
    .map(t => t.time);
}

function generateAllStartTimes(
  slotStart: string,
  slotEnd: string,
  durationMins: number,
  blockedTimes: { start: string; end: string }[],
): { time: string; blocked: boolean }[] {
  const winStart = toMins(slotStart);
  const winEnd = toMins(slotEnd);
  const STEP = 15;
  const seen = new Set<string>();
  const times: { time: string; blocked: boolean }[] = [];
  for (let t = winStart; t + durationMins <= winEnd; t += STEP) {
    const tEnd = t + durationMins;
    const blocked = blockedTimes.some(bt => t < toMins(bt.end) && tEnd > toMins(bt.start));
    const s = fromMins(t);
    if (!seen.has(s)) { seen.add(s); times.push({ time: s, blocked }); }
  }
  return times;
}

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
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const createBooking = useCreateBooking();
  const queryClient = useQueryClient();
  const teacher = teacherData?.teacher;
  const slots = teacherData?.slots ?? [];
  const unassignedStudents = teacherData?.unassignedStudents ?? [];
  const unschedulableStudents = teacherData?.unschedulableStudents ?? [];

  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const navLockedRef = useRef(false);

  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [showEditOffer, setShowEditOffer] = useState(false);

  const [showEditEmailPrompt, setShowEditEmailPrompt] = useState(false);
  const [editEmailInput, setEditEmailInput] = useState("");
  const [editLookupError, setEditLookupError] = useState<string | null>(null);
  const [editReturnToDetails, setEditReturnToDetails] = useState(false);
  const [showBillboard, setShowBillboard] = useState(true);
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const [showBillboardEditPrompt, setShowBillboardEditPrompt] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

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

  const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const slotDayRank = (label: string) => {
    const day = DAY_ORDER.find(d => label.startsWith(d));
    return day ? DAY_ORDER.indexOf(day) : 999;
  };
  const globalHideFullyBlocked = teacherData?.teacher?.hideFullyBlocked !== false;
  const availableSlots = (slots ?? [])
    .filter(s => s.available && !(globalHideFullyBlocked && isFullyBlocked(s.startTime, s.endTime, s.blockedTimes ?? [])))
    .slice()
    .sort((a, b) => slotDayRank(a.label) - slotDayRank(b.label));

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

  useEffect(() => { navLockedRef.current = false; }, [page]);

  const goNext = () => {
    if (navLockedRef.current || !canGoNext()) return;
    navLockedRef.current = true;
    setDirection(1);
    if (editReturnToDetails && page % 3 === 2) {
      setEditReturnToDetails(false);
      setPage(TOTAL_PAGES - 1);
    } else {
      setPage(p => Math.min(p + 1, TOTAL_PAGES - 1));
    }
  };
  const goBack = () => {
    if (navLockedRef.current) return;
    navLockedRef.current = true;
    setDirection(-1);
    setPage(p => Math.max(p - 1, 0));
  };

  const parsePriorityToChoice = (priority: string): Choice | null => {
    const pipeIdx = priority.indexOf("|");
    if (pipeIdx === -1) return null;
    const slotId = parseInt(priority.slice(0, pipeIdx));
    if (isNaN(slotId)) return null;
    const range = priority.slice(pipeIdx + 1);
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) return null;
    const start = range.slice(0, dashIdx);
    const end = range.slice(dashIdx + 1);
    const duration = toMins(end) - toMins(start);
    const preset = DURATION_OPTIONS.find(d => d.value === duration);
    return { slotId, duration: preset ? duration : null, isCustomDuration: !preset, customDurationStr: !preset ? String(duration) : "", start, isCustomTime: false, customTimeStr: "" };
  };

  const applyEditMode = (booking: { id: number; priority1: string; priority2: string; priority3: string }) => {
    const parsed = [booking.priority1, booking.priority2, booking.priority3].map(p => parsePriorityToChoice(p));
    if (parsed.some(c => c === null)) return false;
    setChoices(parsed as Choice[]);
    setEditingBookingId(booking.id);
    setShowEditOffer(false);
    setShowEditEmailPrompt(false);
    setEditEmailInput("");
    setEditLookupError(null);
    setSubmitError(null);
    setEditReturnToDetails(false);
    setPage(TOTAL_PAGES - 1);
    setDirection(1);
    navLockedRef.current = false;
    return true;
  };

  const handleLoadEditMode = async () => {
    setIsEditLoading(true);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(email.trim().toLowerCase())}&slug=${encodeURIComponent(slug ?? "")}`);
      if (!res.ok) { setSubmitError("Couldn't find your submission. Please try again."); return; }
      const booking = await res.json() as { id: number; priority1: string; priority2: string; priority3: string };
      if (!applyEditMode(booking)) { setSubmitError("Couldn't load your previous choices. Please try again."); }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleFrontEditLookup = async () => {
    const emailStr = editEmailInput.trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      setEditLookupError("Please enter a valid email address.");
      return;
    }
    setIsEditLoading(true);
    setEditLookupError(null);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(emailStr)}&slug=${encodeURIComponent(slug ?? "")}`);
      if (res.status === 404) { setEditLookupError("No submission found for that email."); return; }
      if (!res.ok) { setEditLookupError("Something went wrong. Please try again."); return; }
      const booking = await res.json() as { id: number; priority1: string; priority2: string; priority3: string; name?: string; email?: string };
      if (!applyEditMode(booking)) { setEditLookupError("Couldn't load your previous choices. Please try again."); return; }
      if (booking.name) setName(booking.name);
      if (booking.email) setEmail(booking.email);
    } catch {
      setEditLookupError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleBillboardEditLookup = async () => {
    const emailStr = editEmailInput.trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      setEditLookupError("Please enter a valid email address.");
      return;
    }
    setIsEditLoading(true);
    setEditLookupError(null);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(emailStr)}&slug=${encodeURIComponent(slug ?? "")}`);
      if (res.status === 404) { setEditLookupError("No submission found for that email."); return; }
      if (!res.ok) { setEditLookupError("Something went wrong. Please try again."); return; }
      const booking = await res.json() as { id: number; priority1: string; priority2: string; priority3: string; name?: string; email?: string };
      if (!applyEditMode(booking)) { setEditLookupError("Couldn't load your previous choices. Please try again."); return; }
      if (booking.name) setName(booking.name);
      if (booking.email) setEmail(booking.email);
      setShowBillboard(false);
    } catch {
      setEditLookupError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleStartOver = () => {
    setConfirmedBooking(null);
    setPage(0);
    setDirection(1);
    setChoices([
      { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
      { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
      { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
    ]);
    setName("");
    setEmail("");
    setDetailsErrors({});
    setSubmitError(null);
    setEditingBookingId(null);
    setShowEditOffer(false);
    setShowEditEmailPrompt(false);
    setEditEmailInput("");
    setEditLookupError(null);
    setEditReturnToDetails(false);
    navLockedRef.current = false;
  };

  const handleSubmit = async () => {
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
    setShowEditOffer(false);

    // Edit mode: PUT to update existing booking
    if (editingBookingId !== null) {
      setIsUpdating(true);
      try {
        const res = await fetch(`/api/bookings/${editingBookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), priority1: priorities[0], priority2: priorities[1], priority3: priorities[2] }),
        });
        const data = await res.json();
        if (!res.ok) { setSubmitError(data.message ?? "Failed to update. Please try again."); return; }
        // Invalidate billboard data so it shows the freed slot
        await queryClient.invalidateQueries({ queryKey: ["teacher-slots", slug] });
        // Reset form and return to the refreshed billboard
        setEditingBookingId(null);
        setPage(0);
        setDirection(1);
        setChoices([
          { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
          { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
          { slotId: null, duration: null, isCustomDuration: false, customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "" },
        ]);
        setShowBillboardEditPrompt(false);
        setShowBillboard(true);
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 4000);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setSubmitError("Network error. Please try again.");
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    // New booking: POST
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
        const serverMsg = (err as { data?: { message?: string } })?.data?.message;
        if (serverMsg?.toLowerCase().includes("already been submitted")) {
          setShowEditOffer(true);
          return;
        }
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
          {showBillboard ? (
            <motion.div
              key="billboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
              className="bg-card/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden"
            >
              {/* Billboard header */}
              <div className="bg-primary/5 border-b border-border/40 px-6 sm:px-8 pt-6 pb-5">
                {isLoading ? (
                  <div className="h-5 w-32 rounded bg-muted/50 animate-pulse mb-2" />
                ) : teacher ? (
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground leading-tight">{teacher.name}</div>
                      {teacher.subject && (
                        <div className="text-xs text-muted-foreground mt-0.5">{teacher.subject}</div>
                      )}
                    </div>
                  </div>
                ) : null}
                <p className="text-xs font-semibold text-primary/70 uppercase tracking-widest mt-3">Session Schedule</p>
              </div>

              {/* Edit-saved banner */}
              {editSaved && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mx-6 sm:mx-8 mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Your booking has been updated. The teacher will reassign your slot shortly.</span>
                </motion.div>
              )}

              {/* Slot list */}
              <div className="px-6 sm:px-8 py-5 space-y-2.5">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Could not load schedule. Please refresh.
                  </div>
                ) : slots.length === 0 ? (
                  <div className="p-6 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground text-sm">
                    No availability has been set yet. Check back soon.
                  </div>
                ) : (
                  [...slots]
                    .sort((a, b) => slotDayRank(a.label) - slotDayRank(b.label))
                    .map(slot => {
                      const sessions = slot.bookedSessions ?? [];
                      const booked = sessions.length;
                      const isExpanded = expandedSlotId === slot.id;
                      const isClickable = booked > 0 && slot.available;
                      return (
                        <div
                          key={slot.id}
                          className={cn(
                            "rounded-xl border overflow-hidden transition-all",
                            slot.available
                              ? "border-emerald-200 bg-emerald-50/60"
                              : "border-border bg-muted/30 opacity-60",
                          )}
                        >
                          {/* Row */}
                          <button
                            type="button"
                            disabled={!isClickable}
                            onClick={() => isClickable && setExpandedSlotId(isExpanded ? null : slot.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3 text-left",
                              isClickable ? "cursor-pointer" : "cursor-default",
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                slot.available ? "bg-emerald-500" : "bg-muted-foreground/40",
                              )} />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">{slot.label}</div>
                                {!slot.available && (
                                  <div className="text-xs text-muted-foreground mt-0.5">Not accepting bookings</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              {slot.available && (
                                booked > 0 ? (
                                  <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                                    {booked} booked
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                    Open
                                  </span>
                                )
                              )}
                              {isClickable && (
                                <motion.div
                                  animate={{ rotate: isExpanded ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <ChevronDown className="w-3.5 h-3.5 text-amber-600" />
                                </motion.div>
                              )}
                            </div>
                          </button>

                          {/* Expanded booked times */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-3 pt-0 border-t border-emerald-200/60">
                                  <p className="text-[11px] font-semibold text-amber-700/70 uppercase tracking-wide mb-2 mt-2">
                                    Booked windows
                                  </p>
                                  <div className="space-y-1.5">
                                    {[...sessions]
                                      .sort((a, b) => a.start.localeCompare(b.start))
                                      .map((s, i) => (
                                        <div key={i} className="flex items-center gap-2.5 text-xs">
                                          <Clock className="w-3 h-3 shrink-0 text-amber-500" />
                                          <span className="text-amber-900 font-medium tabular-nums">
                                            {fmt12(s.start)} – {fmt12(s.end)}
                                          </span>
                                          <span className="text-muted-foreground">·</span>
                                          <span className="text-foreground font-semibold truncate">{s.name}</span>
                                        </div>
                                      ))
                                    }
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Students not yet through scheduler */}
              {unassignedStudents.length > 0 && (
                <div className="mx-6 sm:mx-8 rounded-xl border border-dashed border-amber-300/60 bg-amber-50/40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-sm font-semibold text-amber-800">Pending Scheduling</span>
                    </div>
                    <span className="text-xs text-amber-700">{unassignedStudents.length} student{unassignedStudents.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="px-4 pb-3 space-y-1.5">
                    {unassignedStudents.map((s, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-amber-200/60">
                        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Students who went through scheduler but couldn't be assigned */}
              {unschedulableStudents.length > 0 && (
                <div className="mx-6 sm:mx-8 rounded-xl border border-dashed border-rose-200/60 bg-rose-50/40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      <span className="text-sm font-semibold text-rose-800">No Slot Available</span>
                    </div>
                    <span className="text-xs text-rose-700">{unschedulableStudents.length} student{unschedulableStudents.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="px-4 pb-3 space-y-1.5">
                    {unschedulableStudents.map((s, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-rose-200/60">
                        <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-xs shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="px-6 sm:px-8 pb-6 pt-1 space-y-3">
                <button
                  onClick={() => setShowBillboard(false)}
                  disabled={isLoading || isError || !slots.some(s => s.available)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Book a Session
                  <ArrowRight className="w-4 h-4" />
                </button>
                {slots.length > 0 && !slots.some(s => s.available) && (
                  <p className="text-center text-xs text-muted-foreground">No slots are currently open for booking.</p>
                )}

                {/* Edit existing submission */}
                <div className="border border-border/50 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBillboardEditPrompt(p => !p);
                      setEditEmailInput("");
                      setEditLookupError(null);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5" />
                      Already submitted? Edit your request
                    </span>
                    <motion.div
                      animate={{ rotate: showBillboardEditPrompt ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  </button>

                  <AnimatePresence initial={false}>
                    {showBillboardEditPrompt && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Enter the email you used when submitting.
                          </p>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            value={editEmailInput}
                            onChange={e => { setEditEmailInput(e.target.value); setEditLookupError(null); }}
                            onKeyDown={e => e.key === "Enter" && handleBillboardEditLookup()}
                            className="h-9 text-sm"
                          />
                          {editLookupError && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {editLookupError}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={handleBillboardEditLookup}
                            disabled={isEditLoading}
                            className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-80 active:scale-[0.98] transition-all disabled:opacity-40"
                          >
                            {isEditLoading ? "Looking up…" : "Find my submission"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : !confirmedBooking ? (
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

              {editingBookingId !== null && (
                <div className="mx-6 sm:mx-8 -mb-1 mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2">
                  <span className="shrink-0">✏️</span>
                  Editing your existing submission — review your choices and tap <strong>Update Request</strong> when ready.
                </div>
              )}

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
                                  <div className={cn("font-semibold text-sm", sel ? "text-primary" : "text-foreground")}>
                                    {slot.label}
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

                        {/* ────── Already submitted? prompt (page 0 only) ────── */}
                        {page === 0 && (
                          <div className="pt-2">
                            {!showEditEmailPrompt ? (
                              <button
                                type="button"
                                onClick={() => setShowEditEmailPrompt(true)}
                                className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
                              >
                                Already submitted? Edit your request instead
                              </button>
                            ) : (
                              <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-2">
                                <p className="text-xs font-semibold text-foreground">Edit your existing submission</p>
                                <p className="text-xs text-muted-foreground">Enter the email you used when you first submitted.</p>
                                <div className="flex gap-2">
                                  <input
                                    type="email"
                                    value={editEmailInput}
                                    onChange={e => { setEditEmailInput(e.target.value); setEditLookupError(null); }}
                                    onKeyDown={e => { if (e.key === "Enter") handleFrontEditLookup(); }}
                                    placeholder="your@email.com"
                                    className="flex-1 text-xs rounded-lg border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleFrontEditLookup}
                                    disabled={isEditLoading}
                                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                                  >
                                    {isEditLoading ? "…" : "Continue"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setShowEditEmailPrompt(false); setEditEmailInput(""); setEditLookupError(null); }}
                                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {editLookupError && (
                                  <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" />{editLookupError}
                                  </p>
                                )}
                              </div>
                            )}
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
                      const allTimes = slot && dur
                        ? generateAllStartTimes(slot.startTime, slot.endTime, dur, slot.blockedTimes ?? [])
                        : [];
                      const availableTimes = allTimes.filter(t => !t.blocked);
                      // Times already chosen in other preferences for the same slot
                      const alreadyPicked = new Set(
                        choices
                          .filter((_, i) => i !== choiceIdx)
                          .filter(ch => ch.slotId === c.slotId && ch.start !== null)
                          .map(ch => ch.start!)
                      );
                      const customTimeError = (() => {
                        if (!c.isCustomTime || !c.customTimeStr || !slot || !dur) return null;
                        const base = validateCustomTime(c.customTimeStr, slot.startTime, slot.endTime, dur, slot.blockedTimes ?? []);
                        if (base) return base;
                        const customStart = toMins(c.customTimeStr);
                        const customEnd = customStart + dur;
                        for (const picked of alreadyPicked) {
                          const ps = toMins(picked);
                          if (customStart < ps + dur && customEnd > ps) {
                            return "That time overlaps with one of your other chosen preferences.";
                          }
                        }
                        return null;
                      })();

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

                          {allTimes.length === 0 ? (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm flex gap-2 items-start">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>
                                No available start times for that duration. Go back and choose a shorter session or a different day.
                              </span>
                            </div>
                          ) : (
                            <>
                              {availableTimes.length === 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm flex gap-2 items-start">
                                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                  <span>All times for this duration are taken. Go back and choose a shorter session or a different day.</span>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
                                {allTimes.map(({ time: t, blocked: isScheduled }) => {
                                const endStr = fromMins(toMins(t) + dur!);
                                const sel = c.start === t;
                                const taken = alreadyPicked.has(t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={taken || isScheduled}
                                    onClick={() => !taken && !isScheduled && updateChoice(choiceIdx, { start: t })}
                                    title={isScheduled ? "This time is already taken" : taken ? "Already chosen as another preference" : undefined}
                                    className={cn(
                                      "flex flex-col items-center px-3.5 py-2.5 rounded-xl border-2 transition-all",
                                      isScheduled
                                        ? "border-rose-200 bg-rose-50 text-rose-300 cursor-not-allowed"
                                        : taken
                                          ? "border-border/30 bg-muted/40 text-muted-foreground/40 cursor-not-allowed line-through"
                                          : sel
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
                                    )}
                                  >
                                    <span className={cn("text-sm font-bold", isScheduled && "line-through decoration-rose-300")}>{fmt12(t)}</span>
                                    <span className="text-[10px]">{isScheduled ? "taken" : taken ? "chosen" : `to ${fmt12(endStr)}`}</span>
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
                            {editingBookingId !== null ? "Tap a preference to change it" : "Your 3 preferences"}
                          </p>
                          {choices.map((c, i) => {
                            const slot = availableSlots.find(s => s.id === c.slotId);
                            const dur = getEffectiveDuration(c);
                            const endStr = c.start && dur ? fromMins(toMins(c.start) + dur) : null;
                            const inner = (
                              <>
                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border shrink-0", PRIORITY_COLORS[i])}>
                                  {PRIORITY_LABELS[i]}
                                </span>
                                <span className="font-medium text-foreground truncate flex-1">{slot?.label ?? "—"}</span>
                                {c.start && endStr && (
                                  <span className="text-muted-foreground text-xs shrink-0">
                                    {fmt12(c.start)} – {fmt12(endStr)}
                                  </span>
                                )}
                                {editingBookingId !== null && (
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                )}
                              </>
                            );
                            return editingBookingId !== null ? (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setEditReturnToDetails(true);
                                  setDirection(-1);
                                  setPage(i * 3);
                                }}
                                className="flex w-full items-center gap-2.5 text-sm px-2 py-1.5 -mx-2 rounded-lg hover:bg-primary/8 transition-colors text-left"
                              >
                                {inner}
                              </button>
                            ) : (
                              <div key={i} className="flex items-center gap-2.5 text-sm">
                                {inner}
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
                              onChange={e => { setEmail(e.target.value); setDetailsErrors(p => ({ ...p, email: undefined })); setShowEditOffer(false); }}
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

                        {showEditOffer && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm space-y-2">
                            <p className="font-medium">You already have a submission for this email.</p>
                            <p className="text-amber-700 text-xs">Would you like to load your previous choices and update them?</p>
                            <button
                              onClick={handleLoadEditMode}
                              disabled={isEditLoading}
                              className="mt-1 flex items-center gap-1.5 bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-800 disabled:opacity-50 transition-all"
                            >
                              {isEditLoading ? "Loading…" : "Edit my submission"}
                            </button>
                          </div>
                        )}

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
                    disabled={createBooking.isPending || isUpdating}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-all"
                  >
                    {(createBooking.isPending || isUpdating)
                      ? (editingBookingId !== null ? "Updating…" : "Submitting…")
                      : (editingBookingId !== null ? "Update Request" : "Submit Request")}
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
                {editingBookingId !== null ? "Preferences Updated!" : "Request Sent!"}
              </motion.h2>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-lg text-muted-foreground mb-8"
              >
                Thanks, <span className="font-semibold text-foreground">{confirmedBooking.name}</span>!{" "}
                {editingBookingId !== null
                  ? "Your preferences have been updated."
                  : "Your preferences have been recorded."}
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

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-6"
              >
                <button
                  onClick={handleStartOver}
                  className="text-sm font-semibold text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                >
                  Submit another request
                </button>
              </motion.div>
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
