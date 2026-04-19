import { AlertCircle } from "lucide-react";

export function ConflictNotice() {
  return (
    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
      <span>Times shown may already be taken by others — your teacher will confirm your final slot.</span>
    </div>
  );
}
