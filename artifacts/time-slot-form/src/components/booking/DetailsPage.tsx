import { AlertCircle, Mail, Pencil, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt12, fromMins, toMins, getEffectiveDuration } from "@/lib/booking-utils";
import { Input } from "@/components/ui/input";
import { ConflictNotice } from "@/components/ConflictNotice";
import type { ApiSlot, Choice } from "@/types/booking";

const PRIORITY_LABELS = ["1st", "2nd", "3rd"] as const;
const PRIORITY_COLORS = [
  "bg-amber-500/15 text-amber-700 border-amber-400/40",
  "bg-blue-500/15 text-blue-700 border-blue-400/40",
  "bg-slate-500/15 text-slate-700 border-slate-400/40",
] as const;

type Teacher = {
  blockFromAppointments?: boolean;
};

type Props = {
  choices: Choice[];
  availableSlots: ApiSlot[];
  editingBookingId: number | null;
  teacher: Teacher | undefined;
  name: string;
  email: string;
  detailsErrors: { name?: string; email?: string };
  showEditOffer: boolean;
  isEditLoading: boolean;
  isCreateError: boolean;
  submitError: string | null;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onClearNameError: () => void;
  onClearEmailError: () => void;
  onClearShowEditOffer: () => void;
  onLoadEditMode: () => Promise<void>;
  onEditPreference: (idx: number) => void;
};

export function DetailsPage({
  choices,
  availableSlots,
  editingBookingId,
  teacher,
  name,
  email,
  detailsErrors,
  showEditOffer,
  isEditLoading,
  isCreateError,
  submitError,
  onNameChange,
  onEmailChange,
  onClearNameError,
  onClearEmailError,
  onClearShowEditOffer,
  onLoadEditMode,
  onEditPreference,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-base font-bold text-foreground">Almost done!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your details and we'll confirm your booking based on your preferences.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {editingBookingId !== null ? "Tap a preference to change it" : "Your 3 preferences"}
        </p>
        {choices.map((c, i) => {
          const slot = availableSlots.find(s => s.id === c.slotId);
          const dur = getEffectiveDuration(c);
          const endStr = c.start && dur ? fromMins(toMins(c.start) + dur) : null;
          const inner = (
            <>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border shrink-0", PRIORITY_COLORS[i])}>
                {PRIORITY_LABELS[i]}
              </span>
              <span className="font-medium text-foreground truncate flex-1">{slot?.label ?? "—"}</span>
              {c.start && endStr && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {fmt12(c.start)} – {fmt12(endStr)}
                </span>
              )}
              {editingBookingId !== null && (
                <Pencil className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              )}
            </>
          );
          return editingBookingId !== null ? (
            <button
              key={i}
              type="button"
              onClick={() => onEditPreference(i)}
              className="flex w-full items-center gap-2.5 text-sm px-2 py-1.5 -mx-2 rounded-lg hover:bg-primary/8 transition-colors text-left"
            >
              {inner}
            </button>
          ) : (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              {inner}
            </div>
          );
        })}
      </div>

      {teacher?.blockFromAppointments === false && <ConflictNotice />}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-muted-foreground" />Full Name
          </label>
          <Input
            value={name}
            onChange={e => { onNameChange(e.target.value); onClearNameError(); }}
            placeholder="Jane Doe"
            maxLength={40}
            error={!!detailsErrors.name}
          />
          {detailsErrors.name && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{detailsErrors.name}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-muted-foreground" />Email Address
          </label>
          <Input
            type="email"
            value={email}
            onChange={e => { onEmailChange(e.target.value); onClearEmailError(); onClearShowEditOffer(); }}
            placeholder="jane@example.com"
            maxLength={40}
            error={!!detailsErrors.email}
          />
          {detailsErrors.email && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{detailsErrors.email}
            </p>
          )}
        </div>
      </div>

      {showEditOffer && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm space-y-2">
          <p className="font-medium">You already have a submission for this email.</p>
          <p className="text-amber-700 text-xs">Would you like to load your previous choices and update them?</p>
          <button
            onClick={onLoadEditMode}
            disabled={isEditLoading}
            className="mt-1 flex items-center gap-1.5 bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-800 disabled:opacity-50 transition-all"
          >
            {isEditLoading ? "Loading…" : "Edit my submission"}
          </button>
        </div>
      )}

      {(isCreateError || submitError) && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-start">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{submitError ?? "Failed to submit. Please try again."}</span>
        </div>
      )}
    </>
  );
}
