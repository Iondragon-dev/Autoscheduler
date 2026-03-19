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
  Send, Bot, Loader2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface NewSlotForm { label: string; startTime: string; endTime: string; }
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface ParsedSlot { label: string; startTime: string; endTime: string; }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function parseSlotsFromResponse(text: string): ParsedSlot[] | null {
  const match = text.match(/<TIMESLOTS>([\s\S]*?)<\/TIMESLOTS>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function stripTimeslotBlock(text: string) {
  return text.replace(/<TIMESLOTS>[\s\S]*?<\/TIMESLOTS>/, "").trim();
}

function dayOfSlot(label: string): string {
  for (const d of DAYS) if (label.startsWith(d)) return d;
  return "Other";
}

// ── AI Chat Popup ────────────────────────────────────────────────────────────
function AiAssistant({ onSlotsCreated }: { onSlotsCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingSlots, setPendingSlots] = useState<ParsedSlot[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createSlot = useCreateTimeSlot();

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open && !done) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, done]);

  // Send greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) sendToAI([]);
  }, [open]);

  async function sendToAI(msgs: ChatMessage[]) {
    setStreaming(true);
    let full = "";

    try {
      const res = await fetch("/api/ai/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMsg = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            assistantMsg += data.content;
            full = assistantMsg;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: assistantMsg };
              return copy;
            });
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }

    setStreaming(false);

    // Check for time slots JSON
    const slots = parseSlotsFromResponse(full);
    if (slots && slots.length > 0) {
      setPendingSlots(slots);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, content: stripTimeslotBlock(last.content) };
        return copy;
      });
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const updated: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    await sendToAI(updated);
  }

  async function handleCreateSlots() {
    if (!pendingSlots) return;
    setCreating(true);
    for (const slot of pendingSlots) {
      await new Promise<void>((resolve) =>
        createSlot.mutate({ data: slot }, { onSuccess: resolve, onError: resolve })
      );
    }
    setCreating(false);
    setDone(true);
    onSlotsCreated();
  }

  function handleReset() {
    setMessages([]);
    setPendingSlots(null);
    setDone(false);
    setOpen(false);
  }

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
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
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
            className="fixed bottom-24 right-6 z-50 w-[min(420px,calc(100vw-3rem))] h-[520px] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-primary/5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Scheduling Assistant</p>
                  <p className="text-xs text-muted-foreground">Powered by AI</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}>
                    {msg.content || (streaming && i === messages.length - 1 ? (
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    ) : "")}
                  </div>
                </div>
              ))}

              {/* Pending slots confirmation */}
              {pendingSlots && !done && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3"
                >
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" />
                    Ready to create {pendingSlots.length} time slot{pendingSlots.length !== 1 ? "s" : ""}
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {pendingSlots.map((s, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        {s.label}
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={handleCreateSlots}
                    isLoading={creating}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Add These Slots
                  </Button>
                </motion.div>
              )}

              {/* Success */}
              {done && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-6 text-center gap-3"
                >
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="font-bold text-foreground">Slots Created!</p>
                  <p className="text-sm text-muted-foreground">Your schedule is ready for student bookings.</p>
                  <Button variant="outline" size="sm" onClick={handleReset}>Done</Button>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {!done && (
              <div className="px-4 py-3 border-t border-border flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Tell me your availability..."
                  disabled={streaming}
                  className="flex-1 text-sm bg-muted/50 border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
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

  const slotsByDay = DAYS.map((day) => ({
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
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      daySlots.length > 0 ? "bg-primary" : "bg-muted-foreground/30"
                    )} />
                    <span className="font-semibold text-sm text-foreground">{day}</span>
                  </div>
                  {daySlots.length > 0 ? (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}
                      </span>
                      {dayBookings.length > 0 && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <Users className="w-3 h-3" />
                          {dayBookings.length} booked
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not available</span>
                  )}
                </div>

                {daySlots.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-2">
                    {daySlots.map((slot) => {
                      const slotBookings = bookingsForSlot(slot.id);
                      const isExpanded = expandedSlotId === slot.id;
                      return (
                        <div key={slot.id} className="w-full">
                          <button
                            onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-all",
                              slot.available
                                ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                                : "bg-muted/40 border-border opacity-60",
                              isExpanded && "bg-primary/10 border-primary/30"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="font-medium text-foreground">{slot.startTime} – {slot.endTime}</span>
                              {!slot.available && <span className="text-muted-foreground">(unavailable)</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {slotBookings.length > 0 && (
                                <span className="flex items-center gap-1 text-primary font-semibold">
                                  <Users className="w-3 h-3" />
                                  {slotBookings.length}
                                </span>
                              )}
                              {slotBookings.length > 0 && (
                                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                              )}
                            </div>
                          </button>

                          <AnimatePresence>
                            {isExpanded && slotBookings.length > 0 && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-1 ml-4 space-y-1">
                                  {slotBookings.map((b, i) => (
                                    <motion.div
                                      key={b.id}
                                      initial={{ opacity: 0, x: -4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.04 }}
                                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                                        {b.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-foreground truncate">{b.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{b.email}</p>
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

  const handleAddSlot = () => {
    if (!form.label.trim() || !form.startTime || !form.endTime) {
      setFormError("Please fill in all fields.");
      return;
    }
    setFormError(null);
    createSlot.mutate(
      { data: { label: form.label.trim(), startTime: form.startTime, endTime: form.endTime } },
      {
        onSuccess: () => {
          setForm({ label: "", startTime: "", endTime: "" });
          setShowAddForm(false);
          refetchSlots();
        },
      }
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

  const bookingsForSlot = (slotId: number) =>
    (bookings ?? []).filter((b) => b.timeSlotId === slotId);

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative max-w-3xl mx-auto z-10 pb-24">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Student Booking
          </Link>
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
                tab === t
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
              )}
            >
              {t === "slots" ? (
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Time Slots</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  Weekly Calendar
                  {(bookings?.length ?? 0) > 0 && (
                    <span className="ml-1 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">
                      {bookings?.length}
                    </span>
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
                  <Button size="sm" onClick={() => { setShowAddForm((v) => !v); setFormError(null); }} variant={showAddForm ? "outline" : "default"}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    {showAddForm ? "Cancel" : "Add Slot"}
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
                                  <Users className="w-3 h-3" />
                                  {slotBookings.length} {slotBookings.length === 1 ? "booking" : "bookings"}
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
                                    <motion.div key={b.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">{b.name.charAt(0).toUpperCase()}</div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><User className="w-3 h-3 text-muted-foreground shrink-0" /><span className="truncate">{b.name}</span></div>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{b.email}</span></div>
                                      </div>
                                      <div className="text-xs text-muted-foreground shrink-0">{new Date(b.createdAt).toLocaleDateString()}</div>
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

      {/* AI Assistant floating button + chat */}
      <AiAssistant onSlotsCreated={() => { refetchSlots(); refetchBookings(); setTab("slots"); }} />
    </div>
  );
}
