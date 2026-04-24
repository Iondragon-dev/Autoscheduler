/**
 * Integration tests for the multi-step student booking form.
 * Mounts the real Home component against a mocked API and exercises
 * full page-navigation flows, choice persistence, and submission.
 *
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import Home from "@/pages/Home";

// ─── Silence missing env var warnings ────────────────────────────────────────
vi.stubEnv("VITE_API_BASE", "");
vi.stubEnv("BASE_URL", "/");

// ─── Framer-motion: return children without animation ────────────────────────
vi.mock("framer-motion", () => {
  const forward = ({ children, ...rest }: Record<string, unknown>) => {
    const div = React.createElement("div", rest, children as React.ReactNode);
    return div;
  };
  const handler: ProxyHandler<object> = { get: (_, prop) => (prop === "__esModule" ? false : forward) };
  const motion = new Proxy({} as Record<string, unknown>, handler);
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children };
});

// ─── Mock wouter so useParams returns our slug ────────────────────────────────
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useParams: () => ({ slug: "test" }),
    Link: ({ children, ...p }: { children: React.ReactNode; [k: string]: unknown }) =>
      React.createElement("a", p, children),
  };
});

// ─── Lucide icons: replace every named export with a no-op span ──────────────
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  const Stub = ({ className }: { className?: string }) =>
    React.createElement("span", { className, "aria-hidden": true });
  const stubbed: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    stubbed[key] = Stub;
  }
  return stubbed;
});

// ─── Mock teacher / slot data ─────────────────────────────────────────────────
const MOCK_SLOT = {
  id: 1,
  label: "Monday 9:00 – 12:00",
  startTime: "09:00",
  endTime: "12:00",
  available: true,
  hideWhenFull: true,
  blockedTimes: [],
  bookedSessions: [],
};

const MOCK_TEACHER_DATA = {
  teacher: {
    id: 1,
    name: "Dr. Test",
    slug: "test",
    subject: "Math",
    hideFullyBlocked: true,
    blockFromAppointments: true,
    durationOptions: null,
    totalPages: null,
  },
  slots: [MOCK_SLOT],
  unassignedStudents: [],
  unschedulableStudents: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderHome() {
  const qc = makeQueryClient();
  return {
    qc,
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={qc}>
        <Router>
          <Home />
        </Router>
      </QueryClientProvider>
    ),
  };
}

/** Selects the mock slot from the dropdown. */
async function pickSlot() {
  const sel = await screen.findByRole("combobox");
  fireEvent.change(sel, { target: { value: String(MOCK_SLOT.id) } });
}

/** Clicks through one complete 3-sub-page choice: picks slot, picks duration, picks first available time */
async function fillOneChoice(user: ReturnType<typeof userEvent.setup>, time = "09:00") {
  // subPage 0: slot picker
  await pickSlot();

  const next0 = await screen.findByText(/^Next/);
  expect(next0).not.toBeDisabled();
  await user.click(next0);

  // subPage 1: duration picker — click "30 min"
  const dur = await screen.findByText("30 min");
  await user.click(dur);

  const next1 = await screen.findByText(/^Next/);
  expect(next1).not.toBeDisabled();
  await user.click(next1);

  // subPage 2: open time input — change value then click Confirm
  const timeInput = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[type="time"]');
    if (!el) throw new Error("time input not found");
    return el;
  });
  fireEvent.change(timeInput, { target: { value: time } });
  const confirmBtn = await screen.findByRole("button", { name: /^Confirm:/i });
  await user.click(confirmBtn);

  const next2 = await screen.findByText(/^Next/);
  expect(next2).not.toBeDisabled();
  await user.click(next2);
}

// ─── Fetch mock setup ─────────────────────────────────────────────────────────

function setupFetch(overrides: { bookingOk?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/teachers/") && urlStr.includes("/timeslots")) {
      return new Response(JSON.stringify(MOCK_TEACHER_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("/api/bookings") && opts?.method === "POST") {
      if (overrides.bookingOk === false) {
        return new Response(JSON.stringify({ message: "Booking conflict." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ id: 99, name: "Test Student", email: "s@test.com" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Billboard screen", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  it("shows the teacher name and a 'Book a Session' button", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Dr. Test")).toBeInTheDocument());
    expect(screen.getByText("Book a Session")).toBeInTheDocument();
  });

  it("transitions to the booking form when 'Book a Session' is clicked", async () => {
    const { user } = renderHome();
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    // The slot picker should now be visible
    await screen.findByText(MOCK_SLOT.label);
  });
});

describe("Slot picker (page 0)", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  it("shows the available slot", async () => {
    const { user } = renderHome();
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await screen.findByText(MOCK_SLOT.label);
  });

  it("Next is disabled until a slot is selected", async () => {
    const { user } = renderHome();
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await screen.findByText(MOCK_SLOT.label);
    const nextBtn = screen.getByText(/^Next/);
    expect(nextBtn).toBeDisabled();
  });

  it("Next becomes enabled after selecting a slot", async () => {
    const { user } = renderHome();
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await pickSlot();
    expect(screen.getByText(/^Next/)).not.toBeDisabled();
  });
});

describe("Duration picker (page 1)", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  async function goToDuration(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await pickSlot();
    await user.click(screen.getByText(/^Next/));
  }

  it("shows duration options after advancing from slot picker", async () => {
    const { user } = renderHome();
    await goToDuration(user);
    await screen.findByText("30 min");
  });

  it("Next is disabled until a duration is chosen", async () => {
    const { user } = renderHome();
    await goToDuration(user);
    await screen.findByText("30 min");
    expect(screen.getByText(/^Next/)).toBeDisabled();
  });

  it("Back returns to the slot picker", async () => {
    const { user } = renderHome();
    await goToDuration(user);
    await screen.findByText("30 min");
    await user.click(screen.getByText(/Back/));
    await screen.findByText(MOCK_SLOT.label);
  });
});

describe("Time picker (page 2)", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  async function goToTime(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await pickSlot();
    await user.click(screen.getByText(/^Next/));
    await user.click(await screen.findByText("30 min"));
    await user.click(screen.getByText(/^Next/));
  }

  it("shows the open time input and window info", async () => {
    const { user } = renderHome();
    await goToTime(user);
    await screen.findByText(/What time works for you/i);
    await waitFor(() => expect(document.querySelector('input[type="time"]')).toBeTruthy());
  });

  it("Next is disabled until a time is entered and confirmed", async () => {
    const { user } = renderHome();
    await goToTime(user);
    await waitFor(() => expect(document.querySelector('input[type="time"]')).toBeTruthy());
    expect(screen.getByText(/^Next/)).toBeDisabled();
  });

  it("Next becomes enabled after entering and confirming a time", async () => {
    const { user } = renderHome();
    await goToTime(user);
    const timeInput = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="time"]');
      if (!el) throw new Error("time input not found");
      return el;
    });
    fireEvent.change(timeInput, { target: { value: "09:00" } });
    await user.click(await screen.findByRole("button", { name: /^Confirm:/i }));
    expect(screen.getByText(/^Next/)).not.toBeDisabled();
  });
});

describe("Choice persistence when navigating back", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  it("preserves the slot selection when going Back from duration picker", async () => {
    const { user } = renderHome();
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await pickSlot();
    // Advance to duration picker
    await user.click(screen.getByText(/^Next/));
    await screen.findByText("30 min");
    // Go back
    await user.click(screen.getByText(/Back/));
    // Slot still shown as selected (Next should be enabled)
    await screen.findByRole("combobox");
    expect(screen.getByText(/^Next/)).not.toBeDisabled();
  });
});

describe("Submission: invalid details (page 9)", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  /** Fast-forward through all 3 choices to reach the details page */
  async function goToDetails(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    // Choice 1 (pages 0-2)
    await fillOneChoice(user, "09:00");
    // Choice 2 (pages 3-5)
    await fillOneChoice(user, "09:30");
    // Choice 3 (pages 6-8)
    await fillOneChoice(user, "10:00");
    // Now on page 9 (details)
    await screen.findByText("Submit Request");
  }

  it("shows name and email validation errors when submitting blank details", async () => {
    const { user } = renderHome();
    await goToDetails(user);
    await user.click(screen.getByText("Submit Request"));
    await screen.findByText("Name is required");
    await screen.findByText("Email is required");
  });

  it("shows only email error when name is filled but email is blank", async () => {
    const { user } = renderHome();
    await goToDetails(user);
    await user.type(screen.getByPlaceholderText(/Jane Doe/i), "Alice");
    await user.click(screen.getByText("Submit Request"));
    await screen.findByText("Email is required");
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("shows email format error for a malformed email", async () => {
    const { user } = renderHome();
    await goToDetails(user);
    await user.type(screen.getByPlaceholderText(/Jane Doe/i), "Alice");
    await user.type(screen.getByPlaceholderText(/jane@example/i), "not-an-email");
    await user.click(screen.getByText("Submit Request"));
    await screen.findByText("Please enter a valid email");
  });
});

describe("Submission: valid details (page 9)", () => {
  beforeEach(() => { setupFetch(); vi.clearAllMocks(); });

  async function goToDetails(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => screen.getByText("Book a Session"));
    await user.click(screen.getByText("Book a Session"));
    await fillOneChoice(user, "09:00");
    await fillOneChoice(user, "09:30");
    await fillOneChoice(user, "10:00");
    await screen.findByText("Submit Request");
  }

  it("calls the booking API with name, email and priorities when form is valid", async () => {
    const fetchMock = setupFetch();
    const { user } = renderHome();
    await goToDetails(user);
    await user.type(screen.getByPlaceholderText(/Jane Doe/i), "Alice");
    await user.type(screen.getByPlaceholderText(/jane@example/i), "alice@example.com");
    await user.click(screen.getByText("Submit Request"));
    await waitFor(() => {
      const postCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][])
        .filter(([u, o]) => String(u).includes("/api/bookings") && o?.method === "POST");
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(postCalls[0][1]!.body as string);
      expect(body.name).toBe("Alice");
      expect(body.email).toBe("alice@example.com");
      expect(body.priority1).toMatch(/^\d+\|09:00-09:30$/);
    });
  });
});
