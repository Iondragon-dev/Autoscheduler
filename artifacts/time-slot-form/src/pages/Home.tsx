import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, User, Mail, AlertCircle, ArrowRight, Star } from "lucide-react";
import { useGetTimeSlots, useCreateBooking } from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react/src/generated/api.schemas";
import { Link } from "wouter";

import { useBookingForm } from "@/hooks/use-booking-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIORITY_META = [
  { label: "1st Choice", sub: "Most preferred", starColor: "text-amber-400", fillStar: true, ring: "ring-amber-400/40", activeBg: "bg-amber-50 border-amber-400" },
  { label: "2nd Choice", sub: "Second preference", starColor: "text-slate-400", fillStar: false, ring: "ring-slate-400/30", activeBg: "bg-slate-50 border-slate-400" },
  { label: "3rd Choice", sub: "Third preference", starColor: "text-slate-300", fillStar: false, ring: "ring-slate-300/30", activeBg: "bg-slate-50/60 border-slate-300" },
];

function fmt12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function generateSubBlocks(startTime: string, endTime: string, stepMins = 60): string[] {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const blocks: string[] = [];
  for (let t = start; t < end; t += stepMins) blocks.push(fromMinutes(t));
  return blocks;
}

export default function Home() {
  const { data: slots, isLoading: isLoadingSlots, isError: isSlotsError } = useGetTimeSlots();
  const createBooking = useCreateBooking();

  const form = useBookingForm();
  const { register, handleSubmit, formState: { errors }, watch, setValue } = form;

  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const selectedSlotId = watch("timeSlotId");
  const priority1 = watch("priority1");
  const priority2 = watch("priority2");
  const priority3 = watch("priority3");
  const priorities = [priority1, priority2, priority3];
  const priorityFields = ["priority1", "priority2", "priority3"] as const;

  const selectedSlot = slots?.find((s) => s.id === selectedSlotId);
  const subBlocks = selectedSlot ? generateSubBlocks(selectedSlot.startTime, selectedSlot.endTime) : [];

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

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative w-full max-w-2xl mx-auto z-10">
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
              <div className="mb-10 text-center">
                <h1 className="text-4xl font-display font-bold text-foreground mb-3">Book a Session</h1>
                <p className="text-lg text-muted-foreground">
                  Pick an available block, then rank your three preferred times.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">

                {/* Step 1: Select block */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-foreground mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">1</div>
                    <h2 className="text-xl font-bold font-display">Choose a Time Block</h2>
                  </div>

                  {isLoadingSlots ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map((i) => <div key={i} className="h-[88px] rounded-xl bg-muted/60 animate-pulse" />)}
                    </div>
                  ) : isSlotsError ? (
                    <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-center flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      <p>Failed to load time blocks. Please try refreshing.</p>
                    </div>
                  ) : slots?.filter(s => s.available).length === 0 ? (
                    <div className="p-8 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground">
                      No time blocks available right now. Please check back later.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slots?.filter(s => s.available).map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        return (
                          <button
                            type="button"
                            key={slot.id}
                            onClick={() => {
                              setValue("timeSlotId", slot.id, { shouldValidate: true });
                              setValue("priority1", "", { shouldValidate: false });
                              setValue("priority2", "", { shouldValidate: false });
                              setValue("priority3", "", { shouldValidate: false });
                            }}
                            className={cn(
                              "relative flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-300 ease-out outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                              isSelected
                                ? "border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.02]"
                                : "border-border hover:border-primary/30 hover:bg-muted/30 bg-card"
                            )}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className={cn("font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                                {slot.label}
                              </span>
                              {isSelected && (
                                <motion.div layoutId="active-indicator" className="w-2.5 h-2.5 rounded-full bg-primary" />
                              )}
                            </div>
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Clock className="w-3.5 h-3.5 mr-1.5" />
                              {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {errors.timeSlotId && (
                    <p className="text-sm font-medium text-destructive flex items-center mt-2">
                      <AlertCircle className="w-4 h-4 mr-1.5" />
                      {errors.timeSlotId.message}
                    </p>
                  )}
                </div>

                {/* Step 2: Pick priorities as blocks */}
                <AnimatePresence>
                  {selectedSlot && subBlocks.length > 0 && (
                    <motion.div
                      key="priorities"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent mb-10" />
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2 text-foreground">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">2</div>
                          <div>
                            <h2 className="text-xl font-bold font-display">Rank Your Preferred Times</h2>
                            <p className="text-sm text-muted-foreground">Select one block for each preference.</p>
                          </div>
                        </div>

                        {PRIORITY_META.map((meta, pi) => {
                          const field = priorityFields[pi];
                          const selected = priorities[pi];
                          const otherPicks = priorities.filter((_, oi) => oi !== pi);

                          return (
                            <div key={pi} className="space-y-2">
                              {/* Priority label */}
                              <div className="flex items-center gap-2">
                                <Star className={cn("w-4 h-4", meta.starColor, meta.fillStar ? "fill-current" : "")} />
                                <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                                <span className="text-xs text-muted-foreground">{meta.sub}</span>
                                {selected && (
                                  <span className="ml-auto text-xs font-semibold text-primary">{fmt12(selected)}</span>
                                )}
                              </div>

                              {/* Clickable sub-blocks */}
                              <div className="flex flex-wrap gap-2">
                                {subBlocks.map((time) => {
                                  const isActive = selected === time;
                                  const isPicked = otherPicks.includes(time);

                                  return (
                                    <button
                                      key={time}
                                      type="button"
                                      disabled={isPicked}
                                      onClick={() => setValue(field, time, { shouldValidate: true })}
                                      className={cn(
                                        "flex flex-col items-center px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 min-w-[80px]",
                                        isActive
                                          ? `${meta.activeBg} shadow-sm ring-2 ${meta.ring} scale-[1.05]`
                                          : isPicked
                                          ? "border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed"
                                          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 text-foreground cursor-pointer"
                                      )}
                                    >
                                      <Clock className={cn("w-3.5 h-3.5 mb-1", isActive ? "text-current" : "text-muted-foreground")} />
                                      {fmt12(time)}
                                      {isPicked && (
                                        <span className="text-[10px] mt-0.5 text-muted-foreground/50">Taken</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {errors[field] && (
                                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Please select a time for your {meta.label.toLowerCase()}.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

                {/* Step 3: Personal Details */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-2 text-foreground mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                      {selectedSlot ? "3" : "2"}
                    </div>
                    <h2 className="text-xl font-bold font-display">Your Details</h2>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center">
                        <User className="w-4 h-4 mr-2 text-muted-foreground" />Full Name
                      </label>
                      <Input placeholder="Jane Doe" {...register("name")} error={!!errors.name} />
                      {errors.name && (
                        <p className="text-sm font-medium text-destructive mt-1.5 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1.5" />{errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" />Email Address
                      </label>
                      <Input type="email" placeholder="jane@example.com" {...register("email")} error={!!errors.email} />
                      {errors.email && (
                        <p className="text-sm font-medium text-destructive mt-1.5 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1.5" />{errors.email.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {createBooking.isError && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                    Failed to submit. Please try again.
                  </div>
                )}

                <div className="pt-4">
                  <Button type="submit" className="w-full text-lg h-14" isLoading={createBooking.isPending}>
                    Submit Request
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    The teacher will confirm a time based on your preferences.
                  </p>
                </div>
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
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
                <img src={`${import.meta.env.BASE_URL}images/success-calendar.png`} alt="Request Sent" className="w-40 h-40 mx-auto mb-8 drop-shadow-2xl" />
              </motion.div>

              <motion.h2 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="text-4xl font-display font-bold text-foreground mb-4">
                Request Sent!
              </motion.h2>

              <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="text-lg text-muted-foreground mb-8">
                Thanks, <span className="font-semibold text-foreground">{confirmedBooking.name}</span>! Your preferences have been recorded — the teacher will confirm your session.
              </motion.p>

              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="bg-white rounded-2xl p-6 shadow-sm border border-border/50 text-left max-w-sm mx-auto space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Time Block</div>
                  <div className="flex items-center text-foreground font-semibold text-lg">
                    <Calendar className="w-5 h-5 mr-2 text-primary" />{confirmedBooking.timeSlotLabel}
                  </div>
                </div>
                <div className="border-t border-border/50 pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">Your Time Preferences</div>
                  <div className="space-y-1.5">
                    {[
                      { p: confirmedBooking.priority1, meta: PRIORITY_META[0] },
                      { p: confirmedBooking.priority2, meta: PRIORITY_META[1] },
                      { p: confirmedBooking.priority3, meta: PRIORITY_META[2] },
                    ].map(({ p, meta }, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Star className={cn("w-3.5 h-3.5 shrink-0", meta.starColor, meta.fillStar ? "fill-current" : "")} />
                        <span className="text-muted-foreground text-xs w-16 font-medium">{meta.label}</span>
                        <span className="font-semibold text-foreground">{fmt12(p)}</span>
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

      <div className="relative z-10 text-center mt-6">
        <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
          Teacher Area
        </Link>
      </div>
    </div>
  );
}
