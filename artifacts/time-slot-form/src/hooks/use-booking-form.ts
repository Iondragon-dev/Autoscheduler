import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const bookingSchema = z.object({
  timeSlotId: z.number({
    required_error: "Please select a time block above.",
    invalid_type_error: "Please select a time block above.",
  }),
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  priority1: z.string().regex(timePattern, "Please enter a valid time."),
  priority2: z.string().regex(timePattern, "Please enter a valid time."),
  priority3: z.string().regex(timePattern, "Please enter a valid time."),
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
