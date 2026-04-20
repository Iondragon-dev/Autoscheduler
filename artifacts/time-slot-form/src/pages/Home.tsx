import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateBooking } from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { toMins, getEffectiveDuration, isFullyBlocked, validateCustomTime, parsePriorityToChoice, canAdvancePage, validateBookingDetails, buildPriorityString } from "@/lib/booking-utils";
import { PRIORITY_LABELS, DURATION_OPTIONS, TOTAL_PAGES, EMPTY_CHOICE, EMPTY_CHOICES, makeEmptyChoices } from "@/lib/booking-constants";
import type { DurationOption } from "@/types/booking";
import type { TeacherSlotData, Choice } from "@/types/booking";

import { Billboard } from "@/components/booking/Billboard";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { DurationPicker } from "@/components/booking/DurationPicker";
import { TimePicker } from "@/components/booking/TimePicker";
import { DetailsPage } from "@/components/booking/DetailsPage";
import { ConfirmationScreen } from "@/components/booking/ConfirmationScreen";
import { BookingFormHeader } from "@/components/booking/BookingFormHeader";
import { BookingFormFooter } from "@/components/booking/BookingFormFooter";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { slug } = useParams<{ slug: string }>();
  const { data: teacherData, isLoading, isError } = useQuery<TeacherSlotData>({
    queryKey: ["teacher-slots", slug],
    queryFn: async () => {
      const res = await fetch(`/api/teachers/${slug}/timeslots`);
      if (!res.ok) throw new Error("Teacher not found");
      return res.json() as Promise<TeacherSlotData>;
    },
    enabled: !!slug,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const createBooking = useCreateBooking();
  const queryClient = useQueryClient();
  const teacher = teacherData?.teacher;
  const slots = teacherData?.slots ?? [];
  const unassignedStudents = teacherData?.unassignedStudents ?? [];
  const unschedulableStudents = teacherData?.unschedulableStudents ?? [];

  const effectiveDurationOptions: DurationOption[] =
    (teacher?.durationOptions && teacher.durationOptions.length > 0)
      ? teacher.durationOptions
      : DURATION_OPTIONS;
  const effectiveTotalPages: number = teacher?.totalPages ?? TOTAL_PAGES;
  const numChoices: number = Math.max(1, Math.min(5, Math.round((effectiveTotalPages - 1) / 3)));
  const activePriorityLabels = PRIORITY_LABELS.slice(0, numChoices);

  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const navLockedRef = useRef(false);

  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [showEditOffer, setShowEditOffer] = useState(false);

  const [showEditEmailPrompt, setShowEditEmailPrompt] = useState(false);
  const [editEmailInput, setEditEmailInput] = useState("");
  const [editLookupError, setEditLookupError] = useState<string | null>(null);
  const [editReturnToDetails, setEditReturnToDetails] = useState(false);
  const [showBillboard, setShowBillboard] = useState(true);
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const [showBillboardEditPrompt, setShowBillboardEditPrompt] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  const [choices, setChoices] = useState<Choice[]>(EMPTY_CHOICES.map(c => ({ ...c })));
  const prevNumChoicesRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevNumChoicesRef.current === null) {
      prevNumChoicesRef.current = numChoices;
      setChoices(makeEmptyChoices(numChoices));
      return;
    }
    if (prevNumChoicesRef.current !== numChoices && page === 0 && !confirmedBooking) {
      prevNumChoicesRef.current = numChoices;
      setChoices(makeEmptyChoices(numChoices));
    }
  }, [numChoices]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [detailsErrors, setDetailsErrors] = useState<{ name?: string; email?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showScrollCue, setShowScrollCue] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    const check = () => {
      const canScroll = document.documentElement.scrollHeight > window.innerHeight + 10;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40;
      setShowScrollCue(canScroll && !atBottom);
    };
    const t = setTimeout(check, 80);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [page]);

  const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const slotDayRank = (label: string) => {
    const day = DAY_ORDER.find(d => label.startsWith(d));
    return day ? DAY_ORDER.indexOf(day) : 999;
  };
  const globalHideFullyBlocked = teacherData?.teacher?.hideFullyBlocked !== false;
  const availableSlots = (slots ?? [])
    .filter(s => s.available && !(globalHideFullyBlocked && isFullyBlocked(s.startTime, s.endTime, s.blockedTimes ?? [])))
    .slice()
    .sort((a, b) => slotDayRank(a.label) - slotDayRank(b.label));

  const isDetails = page === effectiveTotalPages - 1;
  const choiceIdx = Math.min(Math.floor(page / 3), numChoices - 1);
  const subPage = isDetails ? -1 : page % 3;

  const updateChoice = (idx: number, updates: Partial<Choice>) =>
    setChoices(prev => prev.map((c, i) => i === idx ? { ...c, ...updates } : c));

  const currentC = choices[choiceIdx];
  const currentSlot = availableSlots.find(s => s.id === currentC?.slotId);
  const currentDur = currentC ? getEffectiveDuration(currentC) : null;
  const slotWindowMins = currentSlot
    ? toMins(currentSlot.endTime) - toMins(currentSlot.startTime)
    : null;

  const canGoNext = (): boolean =>
    canAdvancePage({ page, totalPages: effectiveTotalPages, subPage, choice: currentC, slotWindowMins, currentSlot, currentDur });

  useEffect(() => { navLockedRef.current = false; }, [page]);

  const goNext = () => {
    if (navLockedRef.current || !canGoNext()) return;
    navLockedRef.current = true;
    setDirection(1);
    if (editReturnToDetails && page % 3 === 2) {
      setEditReturnToDetails(false);
      setPage(effectiveTotalPages - 1);
    } else {
      setPage(p => Math.min(p + 1, effectiveTotalPages - 1));
    }
  };
  const goBack = () => {
    if (navLockedRef.current) return;
    navLockedRef.current = true;
    setDirection(-1);
    setPage(p => Math.max(p - 1, 0));
  };

  const applyEditMode = (booking: { id: number; priority1: string; priority2?: string; priority3?: string; priority4?: string; priority5?: string }) => {
    const allPrios = [booking.priority1, booking.priority2, booking.priority3, booking.priority4, booking.priority5];
    const filledPrios = allPrios.filter((p): p is string => !!p && p.includes("|"));
    const parsed = filledPrios.map(p => parsePriorityToChoice(p));
    if (parsed.some(c => c === null)) return false;
    // Pad up to current numChoices so the choice array always matches the required length
    const filledChoices = parsed as Choice[];
    const paddedChoices = filledChoices.length >= numChoices
      ? filledChoices.slice(0, numChoices)
      : [...filledChoices, ...makeEmptyChoices(numChoices - filledChoices.length)];
    setChoices(paddedChoices);
    setEditingBookingId(booking.id);
    setShowEditOffer(false);
    setShowEditEmailPrompt(false);
    setEditEmailInput("");
    setEditLookupError(null);
    setSubmitError(null);
    setEditReturnToDetails(false);
    setPage(effectiveTotalPages - 1);
    setDirection(1);
    navLockedRef.current = false;
    return true;
  };

  const handleLoadEditMode = async () => {
    setIsEditLoading(true);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(email.trim().toLowerCase())}&slug=${encodeURIComponent(slug ?? "")}`);
      if (!res.ok) { setSubmitError("Couldn't find your submission. Please try again."); return; }
      type BookingLookup = { id: number; priority1: string; priority2?: string; priority3?: string; priority4?: string; priority5?: string; name?: string; email?: string };
      const booking = await res.json() as BookingLookup;
      if (!applyEditMode(booking)) { setSubmitError("Couldn't load your previous choices. Please try again."); }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleFrontEditLookup = async () => {
    const emailStr = editEmailInput.trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      setEditLookupError("Please enter a valid email address.");
      return;
    }
    setIsEditLoading(true);
    setEditLookupError(null);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(emailStr)}&slug=${encodeURIComponent(slug ?? "")}`);
      if (res.status === 404) { setEditLookupError("No submission found for that email."); return; }
      if (!res.ok) { setEditLookupError("Something went wrong. Please try again."); return; }
      type BookingLookup = { id: number; priority1: string; priority2?: string; priority3?: string; priority4?: string; priority5?: string; name?: string; email?: string };
      const booking = await res.json() as BookingLookup;
      if (!applyEditMode(booking)) { setEditLookupError("Couldn't load your previous choices. Please try again."); return; }
      if (booking.name) setName(booking.name);
      if (booking.email) setEmail(booking.email);
    } catch {
      setEditLookupError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleBillboardEditLookup = async () => {
    const emailStr = editEmailInput.trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      setEditLookupError("Please enter a valid email address.");
      return;
    }
    setIsEditLoading(true);
    setEditLookupError(null);
    try {
      const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(emailStr)}&slug=${encodeURIComponent(slug ?? "")}`);
      if (res.status === 404) { setEditLookupError("No submission found for that email."); return; }
      if (!res.ok) { setEditLookupError("Something went wrong. Please try again."); return; }
      type BookingLookup = { id: number; priority1: string; priority2?: string; priority3?: string; priority4?: string; priority5?: string; name?: string; email?: string };
      const booking = await res.json() as BookingLookup;
      if (!applyEditMode(booking)) { setEditLookupError("Couldn't load your previous choices. Please try again."); return; }
      if (booking.name) setName(booking.name);
      if (booking.email) setEmail(booking.email);
      setShowBillboard(false);
    } catch {
      setEditLookupError("Network error. Please try again.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleStartOver = () => {
    setConfirmedBooking(null);
    setPage(0);
    setDirection(1);
    setChoices(makeEmptyChoices(numChoices));
    setName("");
    setEmail("");
    setDetailsErrors({});
    setSubmitError(null);
    setEditingBookingId(null);
    setShowEditOffer(false);
    setShowEditEmailPrompt(false);
    setEditEmailInput("");
    setEditLookupError(null);
    setEditReturnToDetails(false);
    navLockedRef.current = false;
  };

  const handleSubmit = async () => {
    const errs = validateBookingDetails(name, email);
    if (Object.keys(errs).length) { setDetailsErrors(errs); return; }

    const priorities = choices.map(buildPriorityString);

    setSubmitError(null);
    setShowEditOffer(false);

    if (editingBookingId !== null) {
      setIsUpdating(true);
      try {
        const res = await fetch(`/api/bookings/${editingBookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            priority1: priorities[0],
            priority2: priorities[1] ?? "",
            priority3: priorities[2] ?? "",
            priority4: priorities[3] ?? undefined,
            priority5: priorities[4] ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setSubmitError(data.message ?? "Failed to update. Please try again."); return; }
        await queryClient.invalidateQueries({ queryKey: ["teacher-slots", slug] });
        setEditingBookingId(null);
        setPage(0);
        setDirection(1);
        setChoices(makeEmptyChoices(numChoices));
        setShowBillboardEditPrompt(false);
        setShowBillboard(true);
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 4000);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setSubmitError("Network error. Please try again.");
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    createBooking.mutate({
      data: {
        timeSlotId: choices[0].slotId!,
        name: name.trim(),
        email: email.trim(),
        priority1: priorities[0],
        priority2: priorities[1] ?? "",
        priority3: priorities[2] ?? "",
        priority4: priorities[3],
        priority5: priorities[4],
      },
    }, {
      onSuccess: d => {
        setConfirmedBooking(d);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      onError: (err: unknown) => {
        const serverMsg = (err as { data?: { message?: string } })?.data?.message;
        if (serverMsg?.toLowerCase().includes("already been submitted")) {
          setShowEditOffer(true);
          return;
        }
        const msg =
          serverMsg ??
          (err instanceof Error
            ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, "")
            : typeof err === "string" ? err : null) ??
          "Something went wrong. Please try again.";
        setSubmitError(msg);
      },
    });
  };

  const progressPct = ((page + 1) / effectiveTotalPages) * 100;
  const subPageLabel = isDetails
    ? "Your details"
    : ["Which day?", "How long?", "What time?"][subPage] ?? "";

  const pageVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * 50 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -50 }),
  };

  return (
    <div className="relative min-h-screen flex items-start justify-center py-8 px-4 sm:px-6 overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />

      <div className="relative w-full max-w-lg mx-auto z-10">
        <div className="flex justify-between items-center mb-3">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            ← All Teachers
          </Link>
          <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Teacher Sign In →
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {showBillboard ? (
            <motion.div
              key="billboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
            >
              <Billboard
                teacher={teacher}
                slots={slots}
                isLoading={isLoading}
                isError={isError}
                unassignedStudents={unassignedStudents}
                unschedulableStudents={unschedulableStudents}
                editSaved={editSaved}
                showBillboardEditPrompt={showBillboardEditPrompt}
                expandedSlotId={expandedSlotId}
                editEmailInput={editEmailInput}
                editLookupError={editLookupError}
                isEditLoading={isEditLoading}
                slotDayRank={slotDayRank}
                onBook={() => setShowBillboard(false)}
                onToggleBillboardEditPrompt={() => setShowBillboardEditPrompt(p => !p)}
                onSetExpandedSlotId={setExpandedSlotId}
                onEditEmailChange={setEditEmailInput}
                onClearEditLookupError={() => setEditLookupError(null)}
                onBillboardEditLookup={handleBillboardEditLookup}
              />
            </motion.div>
          ) : !confirmedBooking ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
              className="bg-card/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden"
            >
              <BookingFormHeader
                teacher={teacher}
                isDetails={isDetails}
                page={page}
                totalPages={effectiveTotalPages}
                choiceIdx={choiceIdx}
                subPageLabel={subPageLabel}
                progressPct={progressPct}
                editingBookingId={editingBookingId}
                priorityLabels={activePriorityLabels}
              />

              <div className="min-h-[320px]">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={page}
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="px-6 sm:px-8 py-6 space-y-5"
                  >
                    {subPage === 0 && !isDetails && (
                      <SlotPicker
                        availableSlots={availableSlots}
                        currentChoice={currentC}
                        choiceIdx={choiceIdx}
                        isLoading={isLoading}
                        isError={isError}
                        teacher={teacher}
                        page={page}
                        showEditEmailPrompt={showEditEmailPrompt}
                        editEmailInput={editEmailInput}
                        editLookupError={editLookupError}
                        isEditLoading={isEditLoading}
                        priorityLabels={activePriorityLabels}
                        onSelectSlot={slotId => updateChoice(choiceIdx, { slotId, duration: null, start: null })}
                        onSetShowEditEmailPrompt={setShowEditEmailPrompt}
                        onEditEmailChange={setEditEmailInput}
                        onClearEditLookupError={() => setEditLookupError(null)}
                        onFrontEditLookup={handleFrontEditLookup}
                        onCancelEditEmail={() => { setShowEditEmailPrompt(false); setEditEmailInput(""); setEditLookupError(null); }}
                      />
                    )}

                    {subPage === 1 && !isDetails && (
                      <DurationPicker
                        choice={currentC}
                        choiceIdx={choiceIdx}
                        slotWindowMins={slotWindowMins}
                        currentSlot={currentSlot}
                        teacher={teacher}
                        durationOptions={effectiveDurationOptions}
                        priorityLabels={activePriorityLabels}
                        onUpdateChoice={updates => updateChoice(choiceIdx, updates)}
                      />
                    )}

                    {subPage === 2 && !isDetails && (
                      <TimePicker
                        choice={currentC}
                        choiceIdx={choiceIdx}
                        choices={choices}
                        availableSlots={availableSlots}
                        teacher={teacher}
                        validateCustomTime={validateCustomTime}
                        onUpdateChoice={updates => updateChoice(choiceIdx, updates)}
                      />
                    )}

                    {isDetails && (
                      <DetailsPage
                        choices={choices}
                        availableSlots={availableSlots}
                        editingBookingId={editingBookingId}
                        teacher={teacher}
                        name={name}
                        email={email}
                        detailsErrors={detailsErrors}
                        showEditOffer={showEditOffer}
                        isEditLoading={isEditLoading}
                        isCreateError={createBooking.isError}
                        submitError={submitError}
                        onNameChange={setName}
                        onEmailChange={setEmail}
                        onClearNameError={() => setDetailsErrors(p => ({ ...p, name: undefined }))}
                        onClearEmailError={() => setDetailsErrors(p => ({ ...p, email: undefined }))}
                        onClearShowEditOffer={() => setShowEditOffer(false)}
                        onLoadEditMode={handleLoadEditMode}
                        onEditPreference={idx => {
                          setEditReturnToDetails(true);
                          setDirection(-1);
                          setPage(idx * 3);
                        }}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <BookingFormFooter
                page={page}
                isDetails={isDetails}
                canGoNext={canGoNext()}
                isPending={createBooking.isPending}
                isUpdating={isUpdating}
                editingBookingId={editingBookingId}
                onBack={goBack}
                onNext={goNext}
                onSubmit={handleSubmit}
              />
            </motion.div>

          ) : (
            <ConfirmationScreen
              confirmedBooking={confirmedBooking}
              choices={choices}
              availableSlots={availableSlots}
              editingBookingId={editingBookingId}
              onStartOver={handleStartOver}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showScrollCue && (
          <motion.div
            key="scroll-cue"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            onClick={() => window.scrollBy({ top: 300, behavior: "smooth" })}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 cursor-pointer"
          >
            <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-wide uppercase bg-background/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-border/40">
              Scroll for more
            </span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              className="text-primary/70"
            >
              <svg className="w-5 h-5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
