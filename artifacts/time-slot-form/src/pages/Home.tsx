import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, User, Mail, AlertCircle, ArrowRight, Star, X } from "lucide-react";
import { useGetTimeSlots, useCreateBooking } from "@workspace/api-client-react";
import type { Booking, TimeSlot } from "@workspace/api-client-react";
import { Link } from "wouter";

import { useBookingForm } from "@/hooks/use-booking-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt12, fmtPriority, makeValue, toMins } from "@/lib/booking-utils";

// ─── Constants ───────────────────────────────────────────────────────────────


const PRIORITY_META = [
  { rank: 1, label: "1st Choice", starColor: "text-amber-400", fillStar: true, activeBg: "bg-amber-50 border-amber-400", badge: "bg-amber-400 text-white" },
  { rank: 2, label: "2nd Choice", starColor: "text-slate-400", fillStar: false, activeBg: "bg-slate-50 border-slate-400", badge: "bg-slate-400 text-white" },
  { rank: 3, label: "3rd Choice", starColor: "text-slate-300", fillStar: false, activeBg: "bg-slate-50/60 border-slate-300", badge: "bg-slate-300 text-white" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const { data: slots, isLoading: isLoadingSlots, isError: isSlotsError } = useGetTimeSlots();
  const createBooking = useCreateBooking();

  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const form = useBookingForm();
  const { register, handleSubmit, formState: { errors }, watch, setValue } = form;

  const p1 = watch("priority1");
  const p2 = watch("priority2");
  const p3 = watch("priority3");
  const priorities = [p1, p2, p3];
  const priorityFields = ["priority1", "priority2", "priority3"] as const;

  const availableSlots = slots?.filter((s) => s.available) ?? [];

  const slotsWithBlocks = availableSlots;

  // Auto-select first available day when slots load or duration changes
  useEffect(() => {
    if (slotsWithBlocks.length === 0) { setSelectedSlotId(null); return; }
    const ids = slotsWithBlocks.map((s) => s.id);
    if (selectedSlotId === null || !ids.includes(selectedSlotId)) {
      setSelectedSlotId(ids[0]);
    }
  }, [slotsWithBlocks.map((s) => s.id).join(",")]);

  // Reset custom time inputs when the selected slot changes
  useEffect(() => { setCustomStart(""); setCustomEnd(""); }, [selectedSlotId]);

  // Which priority index to fill next (0, 1, or 2; or null if all filled)
  const nextSlot = priorities.findIndex((p) => !p);

  const handleBlockClick = useCallback((value: string, slotId: number) => {
    const existingIdx = priorities.indexOf(value);
    if (existingIdx !== -1) {
      // Deselect: clear this priority, shift subsequent ones down
      const updated = [...priorities];
      updated.splice(existingIdx, 1);
      updated.push("");
      priorityFields.forEach((f, i) => setValue(f, updated[i] ?? "", { shouldValidate: false }));
      // Update timeSlotId from new priority1
      const newP1 = updated[0];
      if (newP1) {
        const newSlotId = Number(newP1.split("|")[0]);
        setValue("timeSlotId", newSlotId, { shouldValidate: false });
      }
    } else if (nextSlot !== -1) {
      // Assign to next open slot
      setValue(priorityFields[nextSlot], value, { shouldValidate: false });
      // Keep timeSlotId in sync with priority1's slot
      if (nextSlot === 0) {
        setValue("timeSlotId", slotId, { shouldValidate: false });
      }
    }
  }, [priorities, nextSlot, setValue]);

  const onSubmit = (values: any) => {
    createBooking.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setConfirmedBooking(data);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      }
    );
  };

  const allFilled = priorities.every(Boolean);

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative w-full max-w-2xl mx-auto z-10">
        <div className="flex justify-end mb-3">
          <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Teacher Area →
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {!confirmedBooking ? (
            <motion.div
              key="booking-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-6 sm:p-10"
            >
              <div className="mb-12 text-center space-y-6">
                <div>
                  <p className="text-sm font-semibold text-primary/70 uppercase tracking-widest mb-2">Welcome to Session Booking</p>
                  <h1 className="text-4xl font-display font-bold text-foreground mb-3">Book a Session</h1>
                  <p className="text-lg text-muted-foreground">
                    Pick 3 preferred times from any available day, then submit your details.
                  </p>
                </div>
                <div className="inline-block rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                  <p className="text-sm text-foreground font-medium">
                    We'll assign you to one of your preferences based on availability.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">

                {/* Step 1: Ranked preference picking */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">1</div>
                    <h2 className="text-xl font-bold font-display">Rank Your Preferred Times</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5 ml-10">
                    Pick 3 time slots from any day — tap a slot to select it, tap again to remove it.
                  </p>

                  {/* Priority summary chips */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {PRIORITY_META.map((meta, i) => {
                      const val = priorities[i];
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                            val
                              ? "border-transparent bg-primary/10 text-primary"
                              : i === nextSlot
                              ? "border-primary/40 bg-primary/5 text-primary/60 animate-pulse"
                              : "border-border/40 bg-muted/30 text-muted-foreground/50"
                          )}
                        >
                          <Star className={cn("w-3 h-3", meta.starColor, meta.fillStar ? "fill-current" : "")} />
                          {meta.label}
                          {val && (
                            <span className="ml-1 text-foreground/70 font-normal">
                              {fmtPriority(val, availableSlots)}
                            </span>
                          )}
                          {val && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...priorities];
                                updated.splice(i, 1);
                                updated.push("");
                                priorityFields.forEach((f, j) => setValue(f, updated[j] ?? "", { shouldValidate: false }));
                                if (i === 0) {
                                  const newP1 = updated[0];
                                  if (newP1) setValue("timeSlotId", Number(newP1.split("|")[0]), { shouldValidate: false });
                                }
                              }}
                              className="ml-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Slots: day picker then sub-blocks */}
                  {isLoadingSlots ? (
                    <div className="flex gap-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-10 w-28 rounded-xl bg-muted/60 animate-pulse" />)}
                    </div>
                  ) : isSlotsError ? (
                    <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-center flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      <p>Failed to load available times. Please try refreshing.</p>
                    </div>
                  ) : slotsWithBlocks.length === 0 ? (
                    <div className="p-8 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground">
                      No time slots available right now. Please check back later.
                    </div>
                  ) : (
                    <>
                      {/* Day picker */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {slotsWithBlocks.map((slot) => {
                          const isSelected = selectedSlotId === slot.id;
                          const picksFromThisDay = priorities.filter(
                            (p) => p && Number(p.split("|")[0]) === slot.id
                          ).length;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlotId(slot.id)}
                              className={cn(
                                "relative flex flex-col items-start px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 text-foreground"
                              )}
                            >
                              <span>{slot.label}</span>
                              <span className={cn("text-[10px] font-normal", isSelected ? "text-primary/70" : "text-muted-foreground")}>
                                {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                              </span>
                              {picksFromThisDay > 0 && (
                                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow">
                                  {picksFromThisDay}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Time entry for selected day */}
                      {selectedSlotId !== null && (() => {
                        const slot = slotsWithBlocks.find((s) => s.id === selectedSlotId);
                        if (!slot) return null;
                        const customValue = customStart && customEnd ? makeValue(slot.id, customStart, customEnd) : "";
                        const customAssignedIdx = customValue ? priorities.indexOf(customValue) : -1;
                        const isCustomAssigned = customAssignedIdx !== -1;
                        const customMeta = isCustomAssigned ? PRIORITY_META[customAssignedIdx] : null;
                        const isCustomValid = !!(
                          customStart && customEnd &&
                          toMins(customStart) >= toMins(slot.startTime) &&
                          toMins(customEnd) <= toMins(slot.endTime) &&
                          toMins(customStart) < toMins(customEnd)
                        );
                        const canAddCustom = isCustomValid && !isCustomAssigned && nextSlot !== -1;
                        return (
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={selectedSlotId}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.2 }}
                              className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3"
                            >
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                                  Enter your time — {slot.label.split(" ")[0]}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Available window: {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                                </p>
                                {slot.blockedTimes && slot.blockedTimes.length > 0 && (
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] text-orange-600 font-semibold flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" /> Unavailable:
                                    </span>
                                    {slot.blockedTimes.map((bt, i) => (
                                      <span key={i} className="text-[11px] bg-orange-50 border border-orange-200 text-orange-700 rounded-md px-1.5 py-0.5 font-medium">
                                        {fmt12(bt.start)} – {fmt12(bt.end)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="time"
                                    value={customStart}
                                    min={slot.startTime}
                                    max={slot.endTime}
                                    onChange={(e) => { setCustomStart(e.target.value); setCustomEnd(""); }}
                                    className="text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                                  />
                                  <span className="text-muted-foreground text-xs">to</span>
                                  <input
                                    type="time"
                                    value={customEnd}
                                    min={customStart || slot.startTime}
                                    max={slot.endTime}
                                    disabled={!customStart}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-40"
                                  />
                                </div>
                                {isCustomAssigned ? (
                                  <button
                                    type="button"
                                    onClick={() => handleBlockClick(customValue, slot.id)}
                                    className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 shadow-sm", customMeta!.activeBg)}
                                  >
                                    <span className={cn("font-bold", customMeta!.starColor)}>{customAssignedIdx + 1}</span>
                                    <X className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canAddCustom}
                                    onClick={() => { if (canAddCustom) handleBlockClick(customValue, slot.id); }}
                                    className={cn(
                                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                      canAddCustom
                                        ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                        : "bg-muted border-border text-muted-foreground/50 cursor-not-allowed"
                                    )}
                                  >
                                    + Add
                                  </button>
                                )}
                                {customStart && customEnd && !isCustomValid && (
                                  <p className="text-[10px] text-destructive w-full">
                                    Must be within {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          </AnimatePresence>
                        );
                      })()}
                    </>
                  )}

                  {/* Priority validation errors */}
                  {(errors.priority1 || errors.priority2 || errors.priority3) && (
                    <p className="text-sm font-medium text-destructive flex items-center gap-1 mt-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Please select all 3 preferred times before submitting.
                    </p>
                  )}
                </div>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

                {/* Step 2: Personal Details */}
                <div className="space-y-5">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">2</div>
                    <h2 className="text-xl font-bold font-display">Your Details</h2>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />Full Name
                    </label>
                    <Input placeholder="Jane Doe" {...register("name")} error={!!errors.name} />
                    {errors.name && (
                      <p className="text-sm font-medium text-destructive mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />{errors.name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />Email Address
                    </label>
                    <Input type="email" placeholder="jane@example.com" {...register("email")} error={!!errors.email} />
                    {errors.email && (
                      <p className="text-sm font-medium text-destructive mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />{errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                {createBooking.isError && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                    Failed to submit. Please try again.
                  </div>
                )}

                <Button type="submit" className="w-full text-lg h-14" isLoading={createBooking.isPending} disabled={!allFilled}>
                  Submit Request
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <p className="text-center text-sm text-muted-foreground -mt-6">
                  The teacher will confirm a time based on your preferences.
                </p>
              </form>
            </motion.div>

          ) : (
            <motion.div
              key="success-view"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
              className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-8 sm:p-12 text-center"
            >
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                <img src={`${import.meta.env.BASE_URL}images/success-calendar.png`} alt="Request Sent" className="w-40 h-40 mx-auto mb-8 drop-shadow-2xl" />
              </motion.div>

              <motion.h2 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="text-4xl font-display font-bold text-foreground mb-4">
                Request Sent!
              </motion.h2>

              <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="text-lg text-muted-foreground mb-8">
                Thanks, <span className="font-semibold text-foreground">{confirmedBooking.name}</span>! Your preferences have been recorded.
              </motion.p>

              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="bg-white rounded-2xl p-6 shadow-sm border border-border/50 text-left max-w-sm mx-auto space-y-4">
                <div className="border-b border-border/50 pb-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">Your Time Preferences</div>
                  <div className="space-y-2">
                    {[
                      { p: confirmedBooking.priority1, meta: PRIORITY_META[0] },
                      { p: confirmedBooking.priority2, meta: PRIORITY_META[1] },
                      { p: confirmedBooking.priority3, meta: PRIORITY_META[2] },
                    ].map(({ p, meta }, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", meta.badge)}>
                          {i + 1}
                        </span>
                        <span className="font-semibold text-foreground">{fmtPriority(p, availableSlots)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="mt-10">
                <Button variant="outline" onClick={() => { setConfirmedBooking(null); form.reset(); }}>
                  Submit Another Request
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
