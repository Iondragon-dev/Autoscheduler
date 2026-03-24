import { useState, useRef, useEffect } from "react";
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
  Bot, CheckCircle2, ArrowRight, Loader2, Star, KeyRound, Eye, EyeOff, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { signOutTeacher } from "./TeacherGate";
import { fmt12, fmtPriority, toMins, fromMins } from "@/lib/booking-utils";

interface NewSlotForm { label: string; startTime: string; endTime: string; }
interface ParsedSlot { label: string; startTime: string; endTime: string; }

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
      const res = await fetch("/api/auth/teacher/passcode", {
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

// ── AI Assistant Popup ───────────────────────────────────────────────────────
type WizardStep = "days" | "times" | "processing" | "confirm" | "done";
type BlockStep = "input" | "done";
type PendingBlock = { slotId: number; slotLabel: string; ranges: { start: string; end: string }[] };

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
  const [mode, setMode] = useState<"create" | "block">("create");

  // Create schedule wizard state
  const [step, setStep] = useState<WizardStep>("days");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [dayTimes, setDayTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [aiMessage, setAiMessage] = useState("");
  const [pendingSlots, setPendingSlots] = useState<ParsedSlot[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Block times state
  const [blockStep, setBlockStep] = useState<BlockStep>("input");
  const [blockSelectedSlotId, setBlockSelectedSlotId] = useState<number | null>(null);
  const [blockRangeStart, setBlockRangeStart] = useState("");
  const [blockRangeEnd, setBlockRangeEnd] = useState("");
  const [pendingBlocks, setPendingBlocks] = useState<PendingBlock[]>([]);
  const [applying, setApplying] = useState(false);

  const createSlot = useCreateTimeSlot();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [step, aiMessage]);

  function handleClose() {
    setOpen(false);
  }

  function resetBlockState() {
    setBlockSelectedSlotId(null); setBlockRangeStart(""); setBlockRangeEnd(""); setPendingBlocks([]);
  }

  function handleOpen() {
    if (step === "done") {
      setStep("days"); setSelectedDays([]); setDayTimes({}); setAiMessage(""); setPendingSlots(null);
    }
    if (blockStep === "done") { setBlockStep("input"); resetBlockState(); }
    setOpen(true);
  }

  function switchMode(m: "create" | "block") {
    setMode(m);
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
      await fetch(`/api/timeslots/${block.slotId}/blocked-times`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges: block.ranges }),
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
      const res = await fetch("/api/ai/schedule", {
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
            className="fixed bottom-24 right-6 z-50 w-[min(440px,calc(100vw-3rem))] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
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
                      {mode === "create" && step === "times" && "Step 2 of 2 — Set your hours"}
                      {mode === "create" && step === "processing" && "Generating your schedule…"}
                      {mode === "create" && step === "confirm" && "Ready to add slots"}
                      {mode === "create" && step === "done" && "Schedule created!"}
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
                {(["create", "block"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-all",
                      mode === m
                        ? "border-border bg-card text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "create" ? "Create Schedule" : "Block Times"}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto max-h-[480px]">
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
                  </motion.div>
                )}

                {mode === "create" && step === "times" && (
                  <motion.div
                    key="times"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-5 space-y-4"
                  >
                    <p className="text-sm text-foreground font-medium">What hours are you free each day?</p>

                    <div className="space-y-3">
                      {orderedSelected.map((day) => (
                        <div key={day} className="bg-muted/30 rounded-xl border border-border p-3">
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            <span className="text-sm font-semibold text-foreground">{day}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1 font-medium">From</label>
                              <input
                                type="time"
                                value={dayTimes[day]?.start ?? "09:00"}
                                onChange={(e) =>
                                  setDayTimes((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], start: e.target.value },
                                  }))
                                }
                                className="w-full text-sm bg-background border border-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1 font-medium">To</label>
                              <input
                                type="time"
                                value={dayTimes[day]?.end ?? "11:00"}
                                onChange={(e) =>
                                  setDayTimes((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], end: e.target.value },
                                  }))
                                }
                                className="w-full text-sm bg-background border border-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1" onClick={() => setStep("days")}>
                        Back
                      </Button>
                      <Button className="flex-1" onClick={handleSubmitSchedule}>
                        Create My Schedule
                        <Sparkles className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </motion.div>
                )}

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
                              {s.label}
                            </div>
                          ))}
                        </div>
                        <Button className="w-full" onClick={handleCreateSlots} isLoading={creating}>
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Add These Slots
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
  const { data: slots } = useGetTimeSlots();
  const { data: bookings } = useGetBookings();
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);

  const slotsByDay = ALL_DAYS.map((day) => ({
    day,
    slots: (slots ?? []).filter((s) => dayOfSlot(s.label) === day),
  }));

  const bookingsForSlot = (slotId: number) =>
    (bookings ?? []).filter((b) => b.timeSlotId === slotId);

  const hasAnySlots = (slots ?? []).length > 0;

  return (
    <div>
      {!hasAnySlots ? (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <Bot className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No schedule yet</p>
          <p className="text-sm mt-1">Use the AI assistant to set up your weekly availability.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slotsByDay.map(({ day, slots: daySlots }) => {
            const dayBookings = daySlots.flatMap((s) => bookingsForSlot(s.id));
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
                  {daySlots.length > 0 ? (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}</span>
                      {dayBookings.length > 0 && (
                        <span className="flex items-center gap-1 text-primary font-medium"><Users className="w-3 h-3" />{dayBookings.length} booked</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not available</span>
                  )}
                </div>

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
                                      <div className="flex flex-wrap gap-1.5">
                                        {[b.priority1, b.priority2, b.priority3].map((p, pi) => (
                                          <div key={pi} className="flex items-center gap-1 text-xs bg-background rounded-md px-1.5 py-0.5 border border-border/50">
                                            <Star className={cn("w-2.5 h-2.5", PRIORITY_COLORS[pi], pi === 0 ? "fill-current" : "")} />
                                            <span className="font-medium">{fmtPriority(p, slots)}</span>
                                          </div>
                                        ))}
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
        </div>
      )}
    </div>
  );
}

// ── Main Teacher Page ────────────────────────────────────────────────────────
export default function Teacher() {
  const [, navigate] = useLocation();
  const { data: slots, isLoading, refetch: refetchSlots } = useGetTimeSlots();
  const { data: bookings, refetch: refetchBookings } = useGetBookings();
  const createSlot = useCreateTimeSlot();
  const updateSlot = useUpdateTimeSlot();
  const deleteSlot = useDeleteTimeSlot();

  const [tab, setTab] = useState<"slots" | "calendar">("slots");
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const [form, setForm] = useState<NewSlotForm>({ label: "", startTime: "", endTime: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [showPasscodeDialog, setShowPasscodeDialog] = useState(false);

  const handleAddSlot = () => {
    if (!form.label.trim() || !form.startTime || !form.endTime) {
      setFormError("Please fill in all fields.");
      return;
    }
    setFormError(null);
    createSlot.mutate(
      { data: { label: form.label.trim(), startTime: form.startTime, endTime: form.endTime } },
      { onSuccess: () => { setForm({ label: "", startTime: "", endTime: "" }); setShowAddForm(false); refetchSlots(); } }
    );
  };

  const handleToggle = (id: number, current: boolean) => {
    updateSlot.mutate({ id, data: { available: !current } }, { onSuccess: () => refetchSlots() });
  };

  const handleDelete = (id: number) => {
    deleteSlot.mutate({ id }, {
      onSuccess: () => {
        setDeleteConfirmId(null);
        if (expandedSlotId === id) setExpandedSlotId(null);
        refetchSlots();
        refetchBookings();
      },
    });
  };

  const bookingsForSlot = (slotId: number) => (bookings ?? []).filter((b) => b.timeSlotId === slotId);

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img src={`${import.meta.env.BASE_URL}images/bg-mesh.png`} alt="" className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none" />

      <div className="relative max-w-3xl mx-auto z-10 pb-24">
        <ChangePasscodeDialog open={showPasscodeDialog} onClose={() => setShowPasscodeDialog(false)} />

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
                onClick={() => { signOutTeacher(); navigate("/"); }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border/50 hover:border-destructive/40 rounded-lg px-3 py-1.5 transition-all bg-card/60 hover:bg-card"
              >
                Sign Out
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Teacher Area</h1>
          <p className="text-muted-foreground text-lg">Manage your schedule and view student bookings.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["slots", "calendar"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-all",
                tab === t ? "bg-primary text-primary-foreground shadow" : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
              )}
            >
              {t === "slots" ? (
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Time Slots</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />Weekly Calendar
                  {(bookings?.length ?? 0) > 0 && (
                    <span className="ml-1 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">{bookings?.length}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "slots" ? (
            <motion.div key="slots" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-foreground text-lg">Available Slots</h2>
                  <Button onClick={() => { setShowAddForm((v) => !v); setFormError(null); }} variant={showAddForm ? "outline" : "default"}>
                    <Plus className="w-4 h-4 mr-1.5" />{showAddForm ? "Cancel" : "Add Slot"}
                  </Button>
                </div>

                <AnimatePresence>
                  {showAddForm && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="bg-muted/30 rounded-xl p-4 mb-4 border border-border space-y-3">
                        <p className="text-sm font-semibold text-foreground mb-2">New Time Slot</p>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1 font-medium">Label</label>
                          <Input placeholder="Monday 9:00 AM – 10:00 AM" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
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
                      return (
                        <motion.div key={slot.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className={cn("rounded-xl border overflow-hidden transition-all", slot.available ? "bg-card border-border" : "bg-muted/40 border-border opacity-70")}>
                          <div className="flex items-center p-4 gap-3">
                            <button type="button" disabled={!hasBookings} onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)} className={cn("shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors", hasBookings ? "hover:bg-muted cursor-pointer" : "cursor-default opacity-30")}>
                              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                            </button>
                            <div className="flex-1 min-w-0 cursor-pointer select-none" onClick={() => hasBookings && setExpandedSlotId(isExpanded ? null : slot.id)}>
                              <div className="font-semibold text-foreground text-sm truncate">{slot.label}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{slot.startTime} – {slot.endTime}</span>
                                <span className={cn("flex items-center gap-1 font-medium", hasBookings ? "text-primary" : "text-muted-foreground")}>
                                  <Users className="w-3 h-3" />{slotBookings.length} {slotBookings.length === 1 ? "booking" : "bookings"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => handleToggle(slot.id, slot.available)} title={slot.available ? "Mark unavailable" : "Mark available"} className="text-muted-foreground hover:text-foreground transition-colors">
                                {slot.available ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
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
                            {isExpanded && hasBookings && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="border-t border-border mx-4 mb-3" />
                                <div className="px-4 pb-4 space-y-2">
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
                                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                                        {[b.priority1, b.priority2, b.priority3].map((p, pi) => (
                                          <div key={pi} className="flex items-center gap-1 text-xs bg-background rounded-lg px-2 py-1 border border-border/50">
                                            <Star className={cn("w-3 h-3", PRIORITY_COLORS[pi], pi === 0 ? "fill-current" : "")} />
                                            <span className="font-medium text-foreground">{fmtPriority(p, slots)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  ))}
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
          ) : (
            <motion.div key="calendar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <h2 className="font-bold text-foreground text-lg mb-4">Weekly Schedule & Bookings</h2>
                <WeeklyCalendar />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AiAssistant
        slots={(slots ?? []).map((s) => ({ ...s, blockedTimes: s.blockedTimes ?? [] }))}
        onSlotsCreated={() => { refetchSlots(); refetchBookings(); setTab("slots"); }}
      />
    </div>
  );
}
