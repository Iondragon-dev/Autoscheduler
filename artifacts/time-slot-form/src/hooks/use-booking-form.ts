import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const bookingSchema = z.object({
  timeSlotId: z.number({ 
    required_error: "Please select a time slot above.",
    invalid_type_error: "Please select a time slot above."
  }),
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address.")
});

export type BookingFormValues = z.infer<typeof bookingSchema>;

export function useBookingForm() {
  return useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });
}
