import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt12, fromMins, toMins, generateAllStartTimes, getEffectiveDuration } from "@/lib/booking-utils";
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
  const allTimes = slot && dur
    ? generateAllStartTimes(slot.startTime, slot.endTime, dur, slot.blockedTimes ?? [])
    : [];
  const availableTimes = allTimes.filter(t => !t.blocked);

  const alreadyPicked = new Set(
    choices
      .filter((_, i) => i !== choiceIdx)
      .filter(ch => ch.slotId === choice.slotId && ch.start !== null)
      .map(ch => ch.start!)
  );

  const customTimeError = (() => {
    if (!choice.isCustomTime || !choice.customTimeStr || !slot || !dur) return null;
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
              const sel = choice.start === t;
              const taken = alreadyPicked.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={taken || isScheduled}
                  onClick={() => !taken && !isScheduled && onUpdateChoice({ start: t })}
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
            onClick={() => onUpdateChoice({ isCustomTime: true, start: null })}
            className={cn(
              "w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
              choice.isCustomTime
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
            )}
          >
            Other (enter time)
          </button>

          {choice.isCustomTime && (
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
                value={choice.customTimeStr}
                onChange={e => onUpdateChoice({ customTimeStr: e.target.value, start: null })}
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

          {choice.isCustomTime && choice.customTimeStr && (
            <button
              type="button"
              disabled={!!customTimeError}
              onClick={() => !customTimeError && onUpdateChoice({ start: choice.customTimeStr })}
              className={cn(
                "w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                customTimeError
                  ? "border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
                  : choice.start === choice.customTimeStr
                    ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
              )}
            >
              {customTimeError
                ? "Fix the time above to continue"
                : choice.start === choice.customTimeStr
                  ? `✓ Confirmed: ${fmt12(choice.customTimeStr)}`
                  : `Confirm: ${fmt12(choice.customTimeStr)}`}
            </button>
          )}
        </>
      )}
    </>
  );
}
