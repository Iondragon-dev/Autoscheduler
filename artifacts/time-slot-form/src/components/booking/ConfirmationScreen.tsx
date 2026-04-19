import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fmt12, fromMins, toMins, getEffectiveDuration } from "@/lib/booking-utils";
import type { ApiSlot, Choice } from "@/types/booking";
import type { Booking } from "@workspace/api-client-react";

const PRIORITY_LABELS = ["1st", "2nd", "3rd"] as const;
const PRIORITY_COLORS = [
  "bg-amber-500/15 text-amber-700 border-amber-400/40",
  "bg-blue-500/15 text-blue-700 border-blue-400/40",
  "bg-slate-500/15 text-slate-700 border-slate-400/40",
] as const;

type Props = {
  confirmedBooking: Booking;
  choices: Choice[];
  availableSlots: ApiSlot[];
  editingBookingId: number | null;
  onStartOver: () => void;
};

export function ConfirmationScreen({
  confirmedBooking,
  choices,
  availableSlots,
  editingBookingId,
  onStartOver,
}: Props) {
  return (
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
          onClick={onStartOver}
          className="text-sm font-semibold text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
        >
          Submit another request
        </button>
      </motion.div>
    </motion.div>
  );
}
