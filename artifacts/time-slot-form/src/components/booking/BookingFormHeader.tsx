import { motion } from "framer-motion";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

type Teacher = {
  name: string;
  subject: string | null;
};

type Props = {
  teacher: Teacher | undefined;
  isDetails: boolean;
  page: number;
  totalPages: number;
  choiceIdx: number;
  subPageLabel: string;
  progressPct: number;
  editingBookingId: number | null;
  priorityLabels: readonly string[];
};

export function BookingFormHeader({
  teacher,
  isDetails,
  page,
  totalPages,
  choiceIdx,
  subPageLabel,
  progressPct,
  editingBookingId,
  priorityLabels,
}: Props) {
  return (
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
              : `${priorityLabels[choiceIdx]} preference · ${subPageLabel}`}
          </h1>
        </div>
        <span className="text-sm font-bold text-muted-foreground tabular-nums">
          {page + 1}<span className="font-normal">/{totalPages}</span>
        </span>
      </div>

      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      <div className="flex gap-1 mt-2.5">
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 rounded-full flex-1 transition-all duration-300",
              i <= page ? "bg-primary/70" : "bg-muted",
            )}
          />
        ))}
      </div>

      {editingBookingId !== null && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2">
          <span className="shrink-0">✏️</span>
          Editing your existing submission — review your choices and tap <strong>Update Request</strong> when ready.
        </div>
      )}
    </div>
  );
}
