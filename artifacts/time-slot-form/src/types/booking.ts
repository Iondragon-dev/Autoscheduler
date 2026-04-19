export type ApiSlot = {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
  hideWhenFull: boolean;
  blockedTimes: { start: string; end: string }[] | null;
  bookedSessions: { start: string; end: string; name: string }[];
};

export type TeacherSlotData = {
  teacher: { id: number; name: string; slug: string; subject: string | null; hideFullyBlocked?: boolean; blockFromAppointments?: boolean };
  slots: ApiSlot[];
  unassignedStudents?: { name: string }[];
  unschedulableStudents?: { name: string }[];
};

export type Choice = {
  slotId: number | null;
  duration: number | null;
  isCustomDuration: boolean;
  customDurationStr: string;
  start: string | null;
  isCustomTime: boolean;
  customTimeStr: string;
};
