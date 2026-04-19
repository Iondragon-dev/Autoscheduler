import { motion } from "framer-motion";
import { AlertCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt12, getEffectiveDuration } from "@/lib/booking-utils";
import { ConflictNotice } from "@/components/ConflictNotice";
import type { ApiSlot, Choice } from "@/types/booking";

type Teacher = {
  blockFromAppointments?: boolean;
};

type DurationOption = {
  label: string;
  value: number;
};

type Props = {
  choice: Choice;
  choiceIdx: number;
  slotWindowMins: number | null;
  currentSlot: ApiSlot | undefined;
  teacher: Teacher | undefined;
  durationOptions: DurationOption[];
  priorityLabels: readonly string[];
  onUpdateChoice: (updates: Partial<Choice>) => void;
};

export function DurationPicker({
  choice,
  choiceIdx,
  slotWindowMins,
  currentSlot,
  teacher,
  durationOptions,
  priorityLabels,
  onUpdateChoice,
}: Props) {
  const dur = getEffectiveDuration(choice);
  const overWindow = slotWindowMins !== null && dur !== null && dur > slotWindowMins;

  return (
    <>
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Timer className="w-4 h-4 text-primary" />
          How long do you need?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a session duration for your {priorityLabels[choiceIdx]} choice.{" "}
          {slotWindowMins !== null && (
            <span className="font-medium text-foreground">
              Available window: {slotWindowMins} min.
            </span>
          )}
        </p>
      </div>

      {teacher?.blockFromAppointments === false && <ConflictNotice />}

      <div className="grid grid-cols-3 gap-2">
        {durationOptions.map(opt => {
          const sel = !choice.isCustomDuration && choice.duration === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdateChoice({ duration: opt.value, isCustomDuration: false, start: null })}
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
          onClick={() => onUpdateChoice({ isCustomDuration: true, duration: null, start: null })}
          className={cn(
            "py-3 rounded-xl border-2 text-sm font-semibold transition-all col-span-3",
            choice.isCustomDuration
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5 text-foreground",
          )}
        >
          Other (enter minutes)
        </button>
      </div>

      {choice.isCustomDuration && (
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
            value={choice.customDurationStr}
            onChange={e => onUpdateChoice({ customDurationStr: e.target.value, start: null })}
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
}
