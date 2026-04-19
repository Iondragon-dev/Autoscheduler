import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  page: number;
  isDetails: boolean;
  canGoNext: boolean;
  isPending: boolean;
  isUpdating: boolean;
  editingBookingId: number | null;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
};

export function BookingFormFooter({
  page,
  isDetails,
  canGoNext,
  isPending,
  isUpdating,
  editingBookingId,
  onBack,
  onNext,
  onSubmit,
}: Props) {
  return (
    <div className="px-6 sm:px-8 pb-6 pt-3 border-t border-border/30 flex items-center justify-between">
      {page > 0 ? (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" />Back
        </button>
      ) : <div />}

      {!isDetails ? (
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={isPending || isUpdating}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-all"
        >
          {(isPending || isUpdating)
            ? (editingBookingId !== null ? "Updating…" : "Submitting…")
            : (editingBookingId !== null ? "Update Request" : "Submit Request")}
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
