import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Accepts "slotId|HH:MM-HH:MM" (new multi-day format) or legacy "HH:MM-HH:MM"
const priorityPattern = /^(\d+\|)?([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export const bookingSchema = z.object({
  timeSlotId: z.number({
    required_error: "Could not determine time block.",
    invalid_type_error: "Could not determine time block.",
  }),
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  priority1: z.string().regex(priorityPattern, "Please select your 1st choice."),
  priority2: z.string().regex(priorityPattern, "Please select your 2nd choice."),
  priority3: z.string().regex(priorityPattern, "Please select your 3rd choice."),
});

export type BookingFormValues = z.infer<typeof bookingSchema>;

export function useBookingForm() {
  return useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      priority1: "",
      priority2: "",
      priority3: "",
    },
  });
}
