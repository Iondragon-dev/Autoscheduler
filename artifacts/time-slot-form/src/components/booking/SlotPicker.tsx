import { AlertCircle, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConflictNotice } from "@/components/ConflictNotice";
import type { ApiSlot, Choice } from "@/types/booking";

type Teacher = {
  blockFromAppointments?: boolean;
};

type Props = {
  availableSlots: ApiSlot[];
  currentChoice: Choice;
  choiceIdx: number;
  isLoading: boolean;
  isError: boolean;
  teacher: Teacher | undefined;
  page: number;
  showEditEmailPrompt: boolean;
  editEmailInput: string;
  editLookupError: string | null;
  isEditLoading: boolean;
  priorityLabels: readonly string[];
  onSelectSlot: (slotId: number) => void;
  onSetShowEditEmailPrompt: (v: boolean) => void;
  onEditEmailChange: (v: string) => void;
  onClearEditLookupError: () => void;
  onFrontEditLookup: () => Promise<void>;
  onCancelEditEmail: () => void;
};

export function SlotPicker({
  availableSlots,
  currentChoice,
  choiceIdx,
  isLoading,
  isError,
  teacher,
  page,
  showEditEmailPrompt,
  editEmailInput,
  editLookupError,
  isEditLoading,
  priorityLabels,
  onSelectSlot,
  onSetShowEditEmailPrompt,
  onEditEmailChange,
  onClearEditLookupError,
  onFrontEditLookup,
  onCancelEditEmail,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          Which day works best?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select an availability block for your {priorityLabels[choiceIdx]} choice.
        </p>
      </div>

      {isLoading ? (
        <div className="h-10 rounded-xl bg-muted/50 animate-pulse" />
      ) : isError ? (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-center">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load available times. Please refresh.
        </div>
      ) : availableSlots.length === 0 ? (
        <div className="p-6 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground text-sm">
          No availability right now. Please check back later.
        </div>
      ) : (
        <select
          value={currentChoice.slotId ?? ""}
          onChange={e => {
            const val = e.target.value;
            if (val !== "") onSelectSlot(Number(val));
          }}
          className={cn(
            "w-full rounded-xl border-2 bg-background px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
            currentChoice.slotId != null
              ? "border-primary text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          <option value="" disabled>Select a day…</option>
          {availableSlots.map(slot => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>
      )}

      {teacher?.blockFromAppointments === false && <ConflictNotice />}

      {page === 0 && (
        <div className="pt-2">
          {!showEditEmailPrompt ? (
            <button
              type="button"
              onClick={() => onSetShowEditEmailPrompt(true)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              Already submitted? Edit your request instead
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-2">
              <p className="text-xs font-semibold text-foreground">Edit your existing submission</p>
              <p className="text-xs text-muted-foreground">Enter the email you used when you first submitted.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={editEmailInput}
                  onChange={e => { onEditEmailChange(e.target.value); onClearEditLookupError(); }}
                  onKeyDown={e => { if (e.key === "Enter") onFrontEditLookup(); }}
                  placeholder="your@email.com"
                  className="flex-1 text-xs rounded-lg border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={onFrontEditLookup}
                  disabled={isEditLoading}
                  className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {isEditLoading ? "…" : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={onCancelEditEmail}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
              {editLookupError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />{editLookupError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
