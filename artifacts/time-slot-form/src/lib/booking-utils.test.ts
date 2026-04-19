import { describe, it, expect } from "vitest";
import {
  validateCustomTime,
  parsePriorityToChoice,
  generateStartTimes,
  isFullyBlocked,
  getEffectiveDuration,
  toMins,
  fromMins,
  fmt12,
} from "./booking-utils";

describe("toMins / fromMins", () => {
  it("converts HH:MM to minutes correctly", () => {
    expect(toMins("09:00")).toBe(540);
    expect(toMins("00:00")).toBe(0);
    expect(toMins("23:59")).toBe(1439);
    expect(toMins("09:15")).toBe(555);
  });

  it("converts minutes back to HH:MM correctly", () => {
    expect(fromMins(540)).toBe("09:00");
    expect(fromMins(0)).toBe("00:00");
    expect(fromMins(1439)).toBe("23:59");
    expect(fromMins(555)).toBe("09:15");
  });

  it("round-trips correctly", () => {
    const times = ["08:00", "12:30", "17:45", "00:00", "23:59"];
    for (const t of times) {
      expect(fromMins(toMins(t))).toBe(t);
    }
  });
});

describe("fmt12", () => {
  it("formats AM times correctly", () => {
    expect(fmt12("09:00")).toBe("9:00 AM");
    expect(fmt12("00:00")).toBe("12:00 AM");
    expect(fmt12("11:30")).toBe("11:30 AM");
  });

  it("formats PM times correctly", () => {
    expect(fmt12("12:00")).toBe("12:00 PM");
    expect(fmt12("13:00")).toBe("1:00 PM");
    expect(fmt12("23:45")).toBe("11:45 PM");
  });

  it("returns empty string for empty input", () => {
    expect(fmt12("")).toBe("");
  });
});

describe("validateCustomTime", () => {
  const slotStart = "09:00";
  const slotEnd = "17:00";
  const noBlocks: { start: string; end: string }[] = [];

  it("returns null for valid times with no blocks", () => {
    expect(validateCustomTime("09:00", slotStart, slotEnd, 30, noBlocks)).toBeNull();
    expect(validateCustomTime("16:30", slotStart, slotEnd, 30, noBlocks)).toBeNull();
  });

  it("rejects start time before slot start", () => {
    const result = validateCustomTime("08:45", slotStart, slotEnd, 30, noBlocks);
    expect(result).toContain("9:00 AM");
  });

  it("rejects when session would end after slot closes", () => {
    const result = validateCustomTime("16:45", slotStart, slotEnd, 30, noBlocks);
    expect(result).toContain("after the slot closes");
    expect(result).toContain("5:00 PM");
  });

  it("allows a session that ends exactly at slot close time", () => {
    expect(validateCustomTime("16:30", slotStart, slotEnd, 30, noBlocks)).toBeNull();
  });

  it("rejects times that overlap with a blocked period", () => {
    const blocked = [{ start: "10:00", end: "11:00" }];
    const result = validateCustomTime("10:30", slotStart, slotEnd, 30, blocked);
    expect(result).toContain("overlaps with a blocked period");
  });

  it("allows time immediately after a blocked period", () => {
    const blocked = [{ start: "10:00", end: "11:00" }];
    expect(validateCustomTime("11:00", slotStart, slotEnd, 30, blocked)).toBeNull();
  });

  it("allows time immediately before a blocked period", () => {
    const blocked = [{ start: "11:00", end: "12:00" }];
    expect(validateCustomTime("10:30", slotStart, slotEnd, 30, blocked)).toBeNull();
  });

  it("rejects time that starts before and overlaps a block", () => {
    const blocked = [{ start: "10:00", end: "10:30" }];
    const result = validateCustomTime("09:45", slotStart, slotEnd, 30, blocked);
    expect(result).toContain("overlaps with a blocked period");
  });

  it("rejects time that starts inside a block", () => {
    const blocked = [{ start: "10:00", end: "11:00" }];
    const result = validateCustomTime("10:15", slotStart, slotEnd, 30, blocked);
    expect(result).toContain("overlaps with a blocked period");
  });
});

describe("parsePriorityToChoice", () => {
  it("parses a valid new-format priority string with a preset duration", () => {
    const result = parsePriorityToChoice("3|09:00-09:30");
    expect(result).not.toBeNull();
    expect(result!.slotId).toBe(3);
    expect(result!.start).toBe("09:00");
    expect(result!.duration).toBe(30);
    expect(result!.isCustomDuration).toBe(false);
    expect(result!.customDurationStr).toBe("");
  });

  it("parses a priority string with a custom (non-preset) duration", () => {
    const result = parsePriorityToChoice("5|09:00-09:25");
    expect(result).not.toBeNull();
    expect(result!.slotId).toBe(5);
    expect(result!.duration).toBeNull();
    expect(result!.isCustomDuration).toBe(true);
    expect(result!.customDurationStr).toBe("25");
  });

  it("returns null for legacy format (no pipe)", () => {
    expect(parsePriorityToChoice("09:00-09:30")).toBeNull();
  });

  it("returns null for malformed string with pipe but no valid slot id", () => {
    expect(parsePriorityToChoice("abc|09:00-09:30")).toBeNull();
  });

  it("returns null for missing dash in range", () => {
    expect(parsePriorityToChoice("3|0900")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePriorityToChoice("")).toBeNull();
  });

  it("handles all preset durations (10, 15, 20, 30, 45, 60 min)", () => {
    const cases: [string, number][] = [
      ["1|09:00-09:10", 10],
      ["1|09:00-09:15", 15],
      ["1|09:00-09:20", 20],
      ["1|09:00-09:30", 30],
      ["1|09:00-09:45", 45],
      ["1|09:00-10:00", 60],
    ];
    for (const [input, expectedDuration] of cases) {
      const result = parsePriorityToChoice(input);
      expect(result!.duration).toBe(expectedDuration);
      expect(result!.isCustomDuration).toBe(false);
    }
  });
});

describe("generateStartTimes", () => {
  it("generates start times within the slot window", () => {
    const times = generateStartTimes("09:00", "10:00", 30, []);
    expect(times).toContain("09:00");
    expect(times).toContain("09:15");
    expect(times).toContain("09:30");
    expect(times).not.toContain("09:45");
  });

  it("excludes times that would overlap blocked periods", () => {
    const blocked = [{ start: "09:30", end: "10:00" }];
    const times = generateStartTimes("09:00", "10:30", 30, blocked);
    expect(times).toContain("09:00");
    expect(times).not.toContain("09:15");
    expect(times).not.toContain("09:30");
    expect(times).toContain("10:00");
  });

  it("returns empty array when no valid slots exist", () => {
    const blocked = [{ start: "09:00", end: "17:00" }];
    const times = generateStartTimes("09:00", "17:00", 30, blocked);
    expect(times).toHaveLength(0);
  });

  it("returns empty array when duration exceeds slot window", () => {
    const times = generateStartTimes("09:00", "09:20", 30, []);
    expect(times).toHaveLength(0);
  });

  it("steps every 15 minutes", () => {
    const times = generateStartTimes("09:00", "10:00", 15, []);
    expect(times).toEqual(["09:00", "09:15", "09:30", "09:45"]);
  });

  it("handles multiple blocked periods correctly", () => {
    const blocked = [
      { start: "09:30", end: "10:00" },
      { start: "10:30", end: "11:00" },
    ];
    const times = generateStartTimes("09:00", "12:00", 30, blocked);
    expect(times).toContain("09:00");
    expect(times).not.toContain("09:15");
    expect(times).not.toContain("09:30");
    expect(times).toContain("10:00");
    expect(times).not.toContain("10:15");
    expect(times).toContain("11:00");
  });
});

describe("isFullyBlocked", () => {
  it("returns false when there are no blocked times", () => {
    expect(isFullyBlocked("09:00", "17:00", [])).toBe(false);
  });

  it("returns true when a single block covers the entire range", () => {
    expect(isFullyBlocked("09:00", "17:00", [{ start: "09:00", end: "17:00" }])).toBe(true);
  });

  it("returns true when a single block exceeds the range", () => {
    expect(isFullyBlocked("09:00", "17:00", [{ start: "08:00", end: "18:00" }])).toBe(true);
  });

  it("returns false when block covers only part of the range", () => {
    expect(isFullyBlocked("09:00", "17:00", [{ start: "09:00", end: "12:00" }])).toBe(false);
  });

  it("returns true when multiple contiguous blocks cover the entire range", () => {
    const blocked = [
      { start: "09:00", end: "12:00" },
      { start: "12:00", end: "17:00" },
    ];
    expect(isFullyBlocked("09:00", "17:00", blocked)).toBe(true);
  });

  it("returns false when there is a gap between blocks", () => {
    const blocked = [
      { start: "09:00", end: "11:00" },
      { start: "12:00", end: "17:00" },
    ];
    expect(isFullyBlocked("09:00", "17:00", blocked)).toBe(false);
  });

  it("returns false when block starts after the window starts", () => {
    expect(isFullyBlocked("09:00", "17:00", [{ start: "10:00", end: "17:00" }])).toBe(false);
  });

  it("handles overlapping blocks that together cover the range", () => {
    const blocked = [
      { start: "09:00", end: "13:00" },
      { start: "11:00", end: "17:00" },
    ];
    expect(isFullyBlocked("09:00", "17:00", blocked)).toBe(true);
  });

  it("handles blocks provided out of order", () => {
    const blocked = [
      { start: "12:00", end: "17:00" },
      { start: "09:00", end: "12:00" },
    ];
    expect(isFullyBlocked("09:00", "17:00", blocked)).toBe(true);
  });
});

describe("getEffectiveDuration", () => {
  it("returns duration directly when not custom", () => {
    expect(getEffectiveDuration({ isCustomDuration: false, customDurationStr: "", duration: 30 })).toBe(30);
    expect(getEffectiveDuration({ isCustomDuration: false, customDurationStr: "", duration: null })).toBeNull();
  });

  it("parses customDurationStr when isCustomDuration is true", () => {
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "25", duration: null })).toBe(25);
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "60", duration: null })).toBe(60);
  });

  it("returns null for non-positive custom duration strings", () => {
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "0", duration: null })).toBeNull();
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "-5", duration: null })).toBeNull();
  });

  it("returns null for non-numeric custom duration strings", () => {
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "", duration: null })).toBeNull();
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "abc", duration: null })).toBeNull();
  });

  it("truncates decimal custom duration strings (parseInt behavior)", () => {
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "1.5", duration: null })).toBe(1);
  });

  it("ignores duration field when isCustomDuration is true", () => {
    expect(getEffectiveDuration({ isCustomDuration: true, customDurationStr: "20", duration: 30 })).toBe(20);
  });
});
