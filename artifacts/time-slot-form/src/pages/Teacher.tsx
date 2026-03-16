import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetTimeSlots,
  useCreateTimeSlot,
  useUpdateTimeSlot,
  useDeleteTimeSlot,
  useGetBookings,
} from "@workspace/api-client-react";
import { Clock, Plus, Trash2, ToggleLeft, ToggleRight, Users, ArrowLeft, AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface NewSlotForm {
  label: string;
  startTime: string;
  endTime: string;
}

export default function Teacher() {
  const { data: slots, isLoading, refetch: refetchSlots } = useGetTimeSlots();
  const { data: bookings, refetch: refetchBookings } = useGetBookings();
  const createSlot = useCreateTimeSlot();
  const updateSlot = useUpdateTimeSlot();
  const deleteSlot = useDeleteTimeSlot();

  const [tab, setTab] = useState<"slots" | "bookings">("slots");
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [form, setForm] = useState<NewSlotForm>({ label: "", startTime: "", endTime: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddSlot = () => {
    if (!form.label.trim() || !form.startTime || !form.endTime) {
      setFormError("Please fill in all fields.");
      return;
    }
    setFormError(null);
    createSlot.mutate(
      { data: { label: form.label.trim(), startTime: form.startTime, endTime: form.endTime } },
      {
        onSuccess: () => {
          setForm({ label: "", startTime: "", endTime: "" });
          setShowAddForm(false);
          refetchSlots();
        },
      }
    );
  };

  const handleToggle = (id: number, current: boolean) => {
    updateSlot.mutate(
      { id, data: { available: !current } },
      { onSuccess: () => refetchSlots() }
    );
  };

  const handleDelete = (id: number) => {
    deleteSlot.mutate(
      { id },
      {
        onSuccess: () => {
          setDeleteConfirmId(null);
          refetchSlots();
          refetchBookings();
        },
      }
    );
  };

  const bookingsForSlot = (slotId: number) =>
    (bookings ?? []).filter((b) => b.timeSlotId === slotId);

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative max-w-3xl mx-auto z-10">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Student Booking
          </Link>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Teacher Area</h1>
          <p className="text-muted-foreground text-lg">Manage your available time slots and view bookings.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["slots", "bookings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-all",
                tab === t
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-card/80 text-muted-foreground hover:text-foreground border border-border"
              )}
            >
              {t === "slots" ? (
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Time Slots</span>
              ) : (
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />Bookings ({bookings?.length ?? 0})</span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "slots" ? (
            <motion.div
              key="slots"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Add slot button */}
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-foreground text-lg">Available Slots</h2>
                  <Button
                    size="sm"
                    onClick={() => { setShowAddForm((v) => !v); setFormError(null); }}
                    variant={showAddForm ? "outline" : "default"}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    {showAddForm ? "Cancel" : "Add Slot"}
                  </Button>
                </div>

                {/* Add form */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-muted/30 rounded-xl p-4 mb-4 border border-border space-y-3">
                        <p className="text-sm font-semibold text-foreground mb-2">New Time Slot</p>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1 font-medium">Label (e.g. Monday 9:00 AM - 10:00 AM)</label>
                          <Input
                            placeholder="Monday 9:00 AM – 10:00 AM"
                            value={form.label}
                            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1 font-medium">Start Time</label>
                            <Input
                              type="time"
                              value={form.startTime}
                              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1 font-medium">End Time</label>
                            <Input
                              type="time"
                              value={form.endTime}
                              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                            />
                          </div>
                        </div>
                        {formError && (
                          <p className="text-sm text-destructive flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />{formError}
                          </p>
                        )}
                        <Button
                          className="w-full"
                          onClick={handleAddSlot}
                          isLoading={createSlot.isPending}
                        >
                          Add Slot
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Slot list */}
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : !slots?.length ? (
                  <div className="py-10 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    No time slots yet. Add one above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slots.map((slot) => {
                      const slotBookings = bookingsForSlot(slot.id);
                      const isDeleting = deleteConfirmId === slot.id;
                      return (
                        <motion.div
                          key={slot.id}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-xl border transition-all",
                            slot.available
                              ? "bg-card border-border"
                              : "bg-muted/40 border-border opacity-70"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-foreground text-sm truncate">{slot.label}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {slot.startTime} – {slot.endTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {slotBookings.length} booking{slotBookings.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            {/* Available toggle */}
                            <button
                              onClick={() => handleToggle(slot.id, slot.available)}
                              title={slot.available ? "Mark as unavailable" : "Mark as available"}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {slot.available ? (
                                <ToggleRight className="w-6 h-6 text-primary" />
                              ) : (
                                <ToggleLeft className="w-6 h-6" />
                              )}
                            </button>

                            {/* Delete */}
                            {!isDeleting ? (
                              <button
                                onClick={() => setDeleteConfirmId(slot.id)}
                                title="Delete slot"
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-destructive font-medium">Delete?</span>
                                <button
                                  onClick={() => handleDelete(slot.id)}
                                  className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded-md font-semibold"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  No
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="bookings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-5">
                <h2 className="font-bold text-foreground text-lg mb-4">All Bookings</h2>
                {!bookings?.length ? (
                  <div className="py-10 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    No bookings yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bookings.map((b) => (
                      <div key={b.id} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 shrink-0">
                          <Calendar className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground text-sm">{b.name}</div>
                          <div className="text-xs text-muted-foreground">{b.email}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {b.timeSlotLabel}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
