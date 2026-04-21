import { motion } from "framer-motion";
import { AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt12, toMins, getEffectiveDuration } from "@/lib/booking-utils";
import { ConflictNotice } from "@/components/ConflictNotice";
import type { ApiSlot, Choice } from "@/types/booking";

type Teacher = {
  blockFromAppointments?: boolean;
};

type Props = {
  choice: Choice;
  choiceIdx: number;
  choices: Choice[];
  availableSlots: ApiSlot[];
  teacher: Teacher | undefined;
  validateCustomTime: (
    start: string,
    slotStart: string,
    slotEnd: string,
    dur: number,
    blockedTimes: { start: string; end: string }[],
  ) => string | null;
  onUpdateChoice: (updates: Partial<Choice>) => void;
};

export function TimePicker({
  choice,
  choiceIdx,
  choices,
  availableSlots,
  teacher,
  validateCustomTime,
  onUpdateChoice,
}: Props) {
  const slot = availableSlots.find(s => s.id === choice.slotId);
  const dur = getEffectiveDuration(choice);

  const alreadyPicked = new Set(
    choices
      .filter((_, i) => i !== choiceIdx)
      .filter(ch => ch.slotId === choice.slotId && ch.start !== null)
      .map(ch => ch.start!)
  );

  const timeError = (() => {
    if (!choice.customTimeStr || !slot || !dur) return null;
    const base = validateCustomTime(choice.customTimeStr, slot.startTime, slot.endTime, dur, slot.blockedTimes ?? []);
    if (base) return base;
    const customStart = toMins(choice.customTimeStr);
    const customEnd = customStart + dur;
    for (const picked of alreadyPicked) {
      const ps = toMins(picked);
      if (customStart < ps + dur && customEnd > ps) {
        return "That time overlaps with one of your other chosen preferences.";
      }
    }
    return null;
  })();

  const confirmed = choice.start !== null && choice.start === choice.customTimeStr;

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

      {teacher?.blockFromAppointments === false && <ConflictNotice />}

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Enter your preferred start time
        </label>
        <input
          type="time"
          value={choice.customTimeStr ?? ""}
          onChange={e => onUpdateChoice({ customTimeStr: e.target.value, start: null })}
          className={cn(
            "w-full text-sm bg-background border rounded-xl px-3 py-2.5 outline-none focus:ring-2 transition-all",
            timeError
              ? "border-destructive/60 focus:ring-destructive/20 focus:border-destructive/60"
              : confirmed
                ? "border-green-500 focus:ring-green-200 focus:border-green-500"
                : "border-border focus:ring-primary/30 focus:border-primary/50",
          )}
          autoFocus
        />

        {timeError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-destructive/8 border border-destructive/25 text-destructive text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {timeError}
          </motion.div>
        )}

        {choice.customTimeStr && (
          <button
            type="button"
            disabled={!!timeError}
            onClick={() => !timeError && onUpdateChoice({ start: choice.customTimeStr })}
            className={cn(
              "w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
              timeError
                ? "border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
                : confirmed
                  ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {timeError
              ? "Fix the time above to continue"
              : confirmed
                ? `✓ Confirmed: ${fmt12(choice.customTimeStr)}`
                : `Confirm: ${fmt12(choice.customTimeStr)}`}
          </button>
        )}
      </div>
    </>
  );
}
