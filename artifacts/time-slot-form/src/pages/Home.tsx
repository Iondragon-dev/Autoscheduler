import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, User, Mail, AlertCircle, ArrowRight } from "lucide-react";
import { useGetTimeSlots, useCreateBooking } from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react/src/generated/api.schemas";

import { useBookingForm } from "@/hooks/use-booking-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  const { data: slots, isLoading: isLoadingSlots, isError: isSlotsError } = useGetTimeSlots();
  const createBooking = useCreateBooking();
  
  const form = useBookingForm();
  const { register, handleSubmit, formState: { errors }, watch, setValue } = form;
  
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  
  const selectedSlotId = watch("timeSlotId");

  const onSubmit = (values: any) => {
    createBooking.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setConfirmedBooking(data);
          // Scroll to top smoothly
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      }
    );
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Beautiful AI Generated Background */}
      <img 
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`} 
        alt="" 
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />
      
      {/* Content Container */}
      <div className="relative w-full max-w-2xl mx-auto z-10">
        
        <AnimatePresence mode="wait">
          {!confirmedBooking ? (
            <motion.div
              key="booking-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-6 sm:p-10"
            >
              <div className="mb-10 text-center">
                <h1 className="text-4xl font-display font-bold text-foreground mb-3">
                  Book a Session
                </h1>
                <p className="text-lg text-muted-foreground">
                  Select a convenient time and let us know who you are.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
                
                {/* Step 1: Select Slot */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-foreground mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">1</div>
                    <h2 className="text-xl font-bold font-display">Choose a Time</h2>
                  </div>

                  {isLoadingSlots ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-[88px] rounded-xl bg-muted/60 animate-pulse" />
                      ))}
                    </div>
                  ) : isSlotsError ? (
                    <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-center flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      <p>Failed to load time slots. Please try refreshing the page.</p>
                    </div>
                  ) : slots?.length === 0 ? (
                    <div className="p-8 rounded-xl border-2 border-dashed border-border text-center text-muted-foreground">
                      No time slots available right now. Please check back later.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slots?.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        return (
                          <button
                            type="button"
                            key={slot.id}
                            disabled={!slot.available}
                            onClick={() => setValue('timeSlotId', slot.id, { shouldValidate: true })}
                            className={cn(
                              "relative flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-300 ease-out outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                              isSelected 
                                ? "border-primary bg-primary/5 shadow-md shadow-primary/10 z-10 scale-[1.02]" 
                                : "border-border hover:border-primary/30 hover:bg-muted/30 bg-card",
                              !slot.available && "opacity-50 cursor-not-allowed bg-muted/50 border-border hover:border-border hover:bg-muted/50"
                            )}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className={cn("font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                                {slot.label}
                              </span>
                              {isSelected && (
                                <motion.div layoutId="active-indicator" className="w-2.5 h-2.5 rounded-full bg-primary" />
                              )}
                            </div>
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Clock className="w-3.5 h-3.5 mr-1.5" />
                              {slot.available ? `${slot.startTime} - ${slot.endTime}` : "Fully Booked"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {errors.timeSlotId && (
                    <p className="text-sm font-medium text-destructive flex items-center mt-2">
                      <AlertCircle className="w-4 h-4 mr-1.5" />
                      {errors.timeSlotId.message}
                    </p>
                  )}
                </div>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

                {/* Step 2: Personal Details */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-2 text-foreground mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">2</div>
                    <h2 className="text-xl font-bold font-display">Your Details</h2>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center">
                        <User className="w-4 h-4 mr-2 text-muted-foreground" />
                        Full Name
                      </label>
                      <Input 
                        placeholder="Jane Doe" 
                        {...register("name")} 
                        error={!!errors.name}
                      />
                      {errors.name && (
                        <p className="text-sm font-medium text-destructive mt-1.5 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1.5" />
                          {errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                        Email Address
                      </label>
                      <Input 
                        type="email"
                        placeholder="jane@example.com" 
                        {...register("email")} 
                        error={!!errors.email}
                      />
                      {errors.email && (
                        <p className="text-sm font-medium text-destructive mt-1.5 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1.5" />
                          {errors.email.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {createBooking.isError && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                    Failed to confirm booking. Please try again.
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-4">
                  <Button 
                    type="submit" 
                    className="w-full text-lg h-14"
                    isLoading={createBooking.isPending}
                  >
                    Confirm Booking
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    You'll receive a confirmation email shortly after.
                  </p>
                </div>

              </form>
            </motion.div>
          ) : (
            /* Success View */
            <motion.div
              key="success-view"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
              className="bg-card/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl shadow-black/5 border border-white/50 p-8 sm:p-12 text-center"
            >
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <img 
                  src={`${import.meta.env.BASE_URL}images/success-calendar.png`} 
                  alt="Booking Confirmed" 
                  className="w-40 h-40 mx-auto mb-8 drop-shadow-2xl"
                />
              </motion.div>
              
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-display font-bold text-foreground mb-4"
              >
                Booking Confirmed!
              </motion.h2>
              
              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-lg text-muted-foreground mb-8"
              >
                You're all set, <span className="font-semibold text-foreground">{confirmedBooking.name}</span>. We've sent a calendar invite to your email.
              </motion.p>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-border/50 text-left max-w-sm mx-auto"
              >
                <div className="flex text-sm text-muted-foreground mb-1 uppercase tracking-wider font-bold">
                  Time Slot
                </div>
                <div className="flex items-center text-foreground font-semibold text-lg mb-4 pb-4 border-b border-border/50">
                  <Calendar className="w-5 h-5 mr-2 text-primary" />
                  {confirmedBooking.timeSlotLabel}
                </div>
                
                <div className="flex text-sm text-muted-foreground mb-1 uppercase tracking-wider font-bold">
                  Contact
                </div>
                <div className="text-foreground font-medium">
                  {confirmedBooking.email}
                </div>
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-10"
              >
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setConfirmedBooking(null);
                    form.reset();
                  }}
                >
                  Book Another Session
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
