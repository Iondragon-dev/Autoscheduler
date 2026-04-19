import type { Choice } from "@/types/booking";

export const PRIORITY_LABELS = ["1st", "2nd", "3rd"] as const;

export const PRIORITY_COLORS = [
  "bg-amber-500/15 text-amber-700 border-amber-400/40",
  "bg-blue-500/15 text-blue-700 border-blue-400/40",
  "bg-slate-500/15 text-slate-700 border-slate-400/40",
] as const;

export const DURATION_OPTIONS = [
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
];

export const TOTAL_PAGES = 10;

export const EMPTY_CHOICE: Choice = {
  slotId: null, duration: null, isCustomDuration: false,
  customDurationStr: "", start: null, isCustomTime: false, customTimeStr: "",
};

export const EMPTY_CHOICES: Choice[] = [{ ...EMPTY_CHOICE }, { ...EMPTY_CHOICE }, { ...EMPTY_CHOICE }];
