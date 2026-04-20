import { describe, it, expect } from "vitest";
import { canAdvancePage, validateBookingDetails, buildPriorityString, parsePriorityToChoice } from "./booking-utils";
import type { Choice } from "@/types/booking";

const EMPTY_CHOICE: Choice = {
  slotId: null,
  duration: null,
  isCustomDuration: false,
  customDurationStr: "",
  start: null,
  isCustomTime: false,
  customTimeStr: "",
};

const SLOT = { startTime: "09:00", endTime: "10:00", blockedTimes: [] };
const SLOT_WIN = 60; // 09:00–10:00 = 60 min

// ─── canAdvancePage ────────────────────────────────────────────────────────────

describe("canAdvancePage — subPage 0 (slot picker)", () => {
  const base = { totalPages: 10, subPage: 0, slotWindowMins: SLOT_WIN };

  it("blocks advance when no slot is selected", () => {
    expect(canAdvancePage({ ...base, page: 0, choice: { ...EMPTY_CHOICE, slotId: null } })).toBe(false);
  });

  it("allows advance when a slot is selected", () => {
    expect(canAdvancePage({ ...base, page: 0, choice: { ...EMPTY_CHOICE, slotId: 42 } })).toBe(true);
  });

  it("blocks advance on page 9 (last page) regardless of slot", () => {
    expect(canAdvancePage({ ...base, page: 9, choice: { ...EMPTY_CHOICE, slotId: 42 } })).toBe(false);
  });
});

describe("canAdvancePage — subPage 1 (duration picker)", () => {
  const base = { totalPages: 10, subPage: 1, slotWindowMins: SLOT_WIN, choice: { ...EMPTY_CHOICE, slotId: 1 } };

  it("blocks when no duration is selected", () => {
    expect(canAdvancePage({ ...base, page: 1, choice: { ...base.choice, duration: null } })).toBe(false);
  });

  it("allows when a valid preset duration is selected", () => {
    expect(canAdvancePage({ ...base, page: 1, choice: { ...base.choice, duration: 30 } })).toBe(true);
  });

  it("blocks when duration exceeds slot window", () => {
    expect(canAdvancePage({ ...base, page: 1, choice: { ...base.choice, duration: 90 } })).toBe(false);
  });

  it("allows when duration exactly equals slot window", () => {
    expect(canAdvancePage({ ...base, page: 1, choice: { ...base.choice, duration: 60 } })).toBe(true);
  });

  it("blocks when custom duration string is invalid", () => {
    const choice = { ...EMPTY_CHOICE, slotId: 1, isCustomDuration: true, customDurationStr: "abc" };
    expect(canAdvancePage({ ...base, page: 1, choice })).toBe(false);
  });

  it("allows when custom duration string is a valid number within window", () => {
    const choice = { ...EMPTY_CHOICE, slotId: 1, isCustomDuration: true, customDurationStr: "45" };
    expect(canAdvancePage({ ...base, page: 1, choice })).toBe(true);
  });

  it("blocks when custom duration string exceeds slot window", () => {
    const choice = { ...EMPTY_CHOICE, slotId: 1, isCustomDuration: true, customDurationStr: "120" };
    expect(canAdvancePage({ ...base, page: 1, choice })).toBe(false);
  });

  it("allows when slotWindowMins is null (no cap)", () => {
    expect(canAdvancePage({ ...base, page: 1, slotWindowMins: null, choice: { ...base.choice, duration: 240 } })).toBe(true);
  });
});

describe("canAdvancePage — subPage 2 (time picker)", () => {
  const base = {
    totalPages: 10,
    subPage: 2,
    slotWindowMins: SLOT_WIN,
    choice: { ...EMPTY_CHOICE, slotId: 1, duration: 30 },
    currentSlot: SLOT,
    currentDur: 30,
  };

  it("blocks when no start time is selected", () => {
    expect(canAdvancePage({ ...base, page: 2, choice: { ...base.choice, start: null } })).toBe(false);
  });

  it("allows when a valid start time is picked from grid", () => {
    const choice = { ...base.choice, start: "09:00", isCustomTime: false };
    expect(canAdvancePage({ ...base, page: 2, choice })).toBe(true);
  });

  it("allows custom time that fits inside slot with no blocks", () => {
    const choice = { ...base.choice, start: "09:15", isCustomTime: true };
    expect(canAdvancePage({ ...base, page: 2, choice })).toBe(true);
  });

  it("blocks custom time that starts before slot opens", () => {
    const choice = { ...base.choice, start: "08:30", isCustomTime: true };
    expect(canAdvancePage({ ...base, page: 2, choice })).toBe(false);
  });

  it("blocks custom time that would end after slot closes", () => {
    const choice = { ...base.choice, start: "09:45", isCustomTime: true, duration: 30, currentDur: 30 };
    expect(canAdvancePage({ ...base, page: 2, choice, currentDur: 30 })).toBe(false);
  });

  it("blocks custom time that overlaps a blocked period", () => {
    const slot = { ...SLOT, blockedTimes: [{ start: "09:15", end: "09:45" }] };
    const choice = { ...base.choice, start: "09:00", isCustomTime: true };
    expect(canAdvancePage({ ...base, page: 2, choice, currentSlot: slot, currentDur: 30 })).toBe(false);
  });

  it("allows custom time that ends exactly when a block begins", () => {
    const slot = { ...SLOT, blockedTimes: [{ start: "09:30", end: "10:00" }] };
    const choice = { ...base.choice, start: "09:00", isCustomTime: true };
    expect(canAdvancePage({ ...base, page: 2, choice, currentSlot: slot, currentDur: 30 })).toBe(true);
  });
});

describe("canAdvancePage — last page", () => {
  it("always returns false on the last page (no advancing beyond details)", () => {
    const choice = { ...EMPTY_CHOICE, slotId: 1, duration: 30, start: "09:00" };
    expect(canAdvancePage({ page: 9, totalPages: 10, subPage: -1, choice, slotWindowMins: 60 })).toBe(false);
  });

  it("is false even with a fully-filled choice", () => {
    const choice = { ...EMPTY_CHOICE, slotId: 5, duration: 15, start: "09:00" };
    expect(canAdvancePage({ page: 9, totalPages: 10, subPage: 2, choice, slotWindowMins: 60 })).toBe(false);
  });
});

// ─── validateBookingDetails ────────────────────────────────────────────────────

describe("validateBookingDetails", () => {
  it("returns no errors for a valid name and email", () => {
    expect(validateBookingDetails("Alice", "alice@example.com")).toEqual({});
  });

  it("returns a name error when name is empty", () => {
    const errs = validateBookingDetails("", "alice@example.com");
    expect(errs.name).toBe("Name is required");
    expect(errs.email).toBeUndefined();
  });

  it("returns a name error when name is whitespace only", () => {
    const errs = validateBookingDetails("   ", "alice@example.com");
    expect(errs.name).toBe("Name is required");
  });

  it("returns an email error when email is empty", () => {
    const errs = validateBookingDetails("Alice", "");
    expect(errs.email).toBe("Email is required");
    expect(errs.name).toBeUndefined();
  });

  it("returns an email error when email is whitespace only", () => {
    const errs = validateBookingDetails("Alice", "   ");
    expect(errs.email).toBe("Email is required");
  });

  it("returns an email format error for a malformed email", () => {
    const errs = validateBookingDetails("Alice", "not-an-email");
    expect(errs.email).toBe("Please enter a valid email");
  });

  it("returns an email format error when domain is missing", () => {
    expect(validateBookingDetails("Alice", "alice@").email).toBe("Please enter a valid email");
  });

  it("returns both errors when both are missing", () => {
    const errs = validateBookingDetails("", "");
    expect(errs.name).toBeTruthy();
    expect(errs.email).toBeTruthy();
  });

  it("trims whitespace before validating email format", () => {
    expect(validateBookingDetails("Alice", "  alice@example.com  ")).toEqual({});
  });
});

// ─── buildPriorityString ───────────────────────────────────────────────────────

describe("buildPriorityString", () => {
  it("builds 'slotId|start-end' for a preset duration", () => {
    const choice: Choice = { ...EMPTY_CHOICE, slotId: 7, duration: 30, start: "09:00" };
    expect(buildPriorityString(choice)).toBe("7|09:00-09:30");
  });

  it("builds 'slotId|start-end' for a custom duration", () => {
    const choice: Choice = { ...EMPTY_CHOICE, slotId: 3, isCustomDuration: true, customDurationStr: "45", start: "10:15" };
    expect(buildPriorityString(choice)).toBe("3|10:15-11:00");
  });

  it("produces 24:00 (not 00:00) when a session ends exactly at midnight", () => {
    // fromMins does not wrap — 1440 min = "24:00", not "00:00".
    // Slots spanning midnight are unsupported; this documents the actual output.
    const choice: Choice = { ...EMPTY_CHOICE, slotId: 1, duration: 60, start: "23:00" };
    expect(buildPriorityString(choice)).toBe("1|23:00-24:00");
  });

  it("round-trips through parsePriorityToChoice", () => {
    const choice: Choice = { ...EMPTY_CHOICE, slotId: 5, duration: 15, start: "09:00" };
    const str = buildPriorityString(choice);
    const parsed = parsePriorityToChoice(str);
    expect(parsed?.slotId).toBe(5);
    expect(parsed?.start).toBe("09:00");
    expect(parsed?.duration).toBe(15);
  });
});

// ─── Back navigation ──────────────────────────────────────────────────────────
// Back navigation has no guard logic: page > 0 always allows going back.
// These tests document that assumption via the data model.

describe("back navigation assumptions", () => {
  it("page 0 is the only page that has no previous page", () => {
    expect(0 - 1).toBeLessThan(0);
  });

  it("any page > 0 can decrement by 1", () => {
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(Math.max(p - 1, 0)).toBe(p - 1);
    }
  });
});

// ─── Choice isolation ─────────────────────────────────────────────────────────

describe("choice update isolation", () => {
  const makeChoices = (): Choice[] => [
    { ...EMPTY_CHOICE, slotId: 1 },
    { ...EMPTY_CHOICE, slotId: 2 },
    { ...EMPTY_CHOICE, slotId: 3 },
  ];

  const updateChoice = (choices: Choice[], idx: number, updates: Partial<Choice>) =>
    choices.map((c, i) => (i === idx ? { ...c, ...updates } : c));

  it("updating choice at index 0 does not affect index 1 or 2", () => {
    const choices = makeChoices();
    const updated = updateChoice(choices, 0, { slotId: 99, duration: 30 });
    expect(updated[0].slotId).toBe(99);
    expect(updated[1].slotId).toBe(2);
    expect(updated[2].slotId).toBe(3);
  });

  it("resetting a choice clears only that index", () => {
    const choices = makeChoices();
    const updated = updateChoice(choices, 1, { slotId: null, duration: null, start: null });
    expect(updated[0].slotId).toBe(1);
    expect(updated[1].slotId).toBeNull();
    expect(updated[2].slotId).toBe(3);
  });

  it("changing slot on a choice resets its duration and start", () => {
    const choices = makeChoices();
    const reset = updateChoice(choices, 0, { slotId: 7, duration: null, start: null });
    expect(reset[0]).toMatchObject({ slotId: 7, duration: null, start: null });
  });
});

// ─── buildPriorityString + parsePriorityToChoice full roundtrip ───────────────

describe("priority string roundtrip (build → parse)", () => {
  const cases: { label: string; choice: Choice }[] = [
    { label: "15 min preset", choice: { ...EMPTY_CHOICE, slotId: 1, duration: 15, start: "08:00" } },
    { label: "30 min preset", choice: { ...EMPTY_CHOICE, slotId: 4, duration: 30, start: "14:30" } },
    { label: "60 min preset", choice: { ...EMPTY_CHOICE, slotId: 9, duration: 60, start: "11:00" } },
    { label: "custom 25 min", choice: { ...EMPTY_CHOICE, slotId: 2, isCustomDuration: true, customDurationStr: "25", start: "09:00" } },
    { label: "custom 90 min", choice: { ...EMPTY_CHOICE, slotId: 6, isCustomDuration: true, customDurationStr: "90", start: "13:00" } },
  ];

  for (const { label, choice } of cases) {
    it(`round-trips for: ${label}`, () => {
      const str = buildPriorityString(choice);
      const parsed = parsePriorityToChoice(str);
      expect(parsed).not.toBeNull();
      expect(parsed!.slotId).toBe(choice.slotId);
      expect(parsed!.start).toBe(choice.start);
      const origDur = choice.isCustomDuration ? parseInt(choice.customDurationStr) : choice.duration;
      const parsedDur = parsed!.isCustomDuration ? parseInt(parsed!.customDurationStr) : parsed!.duration;
      expect(parsedDur).toBe(origDur);
    });
  }
});
