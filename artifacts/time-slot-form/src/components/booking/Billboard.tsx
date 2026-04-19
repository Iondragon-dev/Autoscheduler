import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowRight, CheckCircle2,
  GraduationCap, ChevronDown, Pencil, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt12 } from "@/lib/booking-utils";
import { Input } from "@/components/ui/input";
import type { ApiSlot } from "@/types/booking";

type Teacher = {
  name: string;
  subject: string | null;
};

type UnassignedStudent = { name: string };

type Props = {
  teacher: Teacher | undefined;
  slots: ApiSlot[];
  isLoading: boolean;
  isError: boolean;
  unassignedStudents: UnassignedStudent[];
  unschedulableStudents: UnassignedStudent[];
  editSaved: boolean;
  showBillboardEditPrompt: boolean;
  expandedSlotId: number | null;
  editEmailInput: string;
  editLookupError: string | null;
  isEditLoading: boolean;
  slotDayRank: (label: string) => number;
  onBook: () => void;
  onToggleBillboardEditPrompt: () => void;
  onSetExpandedSlotId: (id: number | null) => void;
  onEditEmailChange: (val: string) => void;
  onClearEditLookupError: () => void;
  onBillboardEditLookup: () => Promise<void>;
};

export function Billboard({
  teacher,
  slots,
  isLoading,
  isError,
  unassignedStudents,
  unschedulableStudents,
  editSaved,
  showBillboardEditPrompt,
  expandedSlotId,
  editEmailInput,
  editLookupError,
  isEditLoading,
  slotDayRank,
  onBook,
  onToggleBillboardEditPrompt,
  onSetExpandedSlotId,
  onEditEmailChange,
  onClearEditLookupError,
  onBillboardEditLookup,
}: Props) {
  return (
    <div className="bg-card/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden">
      {/* Header */}
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
            {[1, 2, 3, 4].map(i => (
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
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onSetExpandedSlotId(isExpanded ? null : slot.id)}
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

      {/* Pending scheduling */}
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

      {/* No slot available */}
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
          onClick={onBook}
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
              onToggleBillboardEditPrompt();
              onEditEmailChange("");
              onClearEditLookupError();
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
                    onChange={e => { onEditEmailChange(e.target.value); onClearEditLookupError(); }}
                    onKeyDown={e => e.key === "Enter" && onBillboardEditLookup()}
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
                    onClick={onBillboardEditLookup}
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
    </div>
  );
}
