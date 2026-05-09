"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AppTab,
  AdminVariableRecord,
  BootstrapPayload,
  CalendarWeekStartsOn,
  ItemRecord,
  ScheduleRecord,
  StatusEventRecord,
  UserSettingsRecord,
  WorklogRecord,
} from "@/lib/types";

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "inbox", label: "Inbox" },
  { id: "active", label: "Active" },
  { id: "longterm", label: "Long-term" },
  { id: "schedule", label: "Schedule" },
  { id: "calendar", label: "Calendar" },
  { id: "worklogs", label: "Work Log" },
  { id: "done", label: "Done" },
];

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 · Critical",
  2: "P2 · High",
  3: "P3 · Normal",
  4: "P4 · Low",
  5: "P5 · Someday",
};

type FeedbackLevel = "info" | "success" | "error" | "busy";

interface Props {
  initialData: BootstrapPayload;
}

interface EditingDraft {
  id: string;
  title: string;
  content: string;
  priority: number;
}

interface WorklogDraftState {
  logDate: string | null;
  title: string | null;
  contentMd: string;
  contextSummary: Record<string, unknown>;
  savedId: string | null;
  statusText: string;
}

interface AuthDraft {
  email: string;
  password: string;
}

interface ScheduleDraft {
  title: string;
  notes: string;
  scheduleDate: string;
}

interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  isWeekend: boolean;
  schedules: ScheduleRecord[];
  doing: ItemRecord[];
  done: ItemRecord[];
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayInputDate() {
  return formatDateKey(new Date());
}

function monthInputDate(date: string) {
  return date.slice(0, 7);
}

function addDays(date: string, days: number) {
  const next = parseDateKey(date);
  next.setDate(next.getDate() + days);
  return formatDateKey(next);
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function buildExportMarkdown(items: ItemRecord[], schedules: ScheduleRecord[], worklogs: WorklogRecord[]) {
  return [
    "# ScaffoldOrganizer Export",
    "",
    "## Items",
    ...items.map((item) => `- [${item.status}] ${item.title}`),
    "",
    "## Schedules",
    ...schedules.map((schedule) => `- ${schedule.scheduleDate} · ${schedule.title}`),
    "",
    "## Worklogs",
    ...worklogs.map((worklog) => `- ${worklog.logDate} · ${worklog.title}`),
  ].join("\n");
}

function filterItems(items: ItemRecord[], activeTab: AppTab, query: string) {
  let scoped = items;

  if (activeTab === "inbox") {
    scoped = items.filter((item) => item.status === "inbox");
  } else if (activeTab === "active") {
    scoped = items.filter(
      (item) =>
        (item.status === "todo" || item.status === "doing") &&
        item.horizon !== "long_term",
    );
  } else if (activeTab === "longterm") {
    scoped = items.filter((item) => item.horizon === "long_term" && item.status !== "archived");
  } else if (activeTab === "done") {
    scoped = items.filter((item) => item.status === "done");
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return scoped;
  }

  return scoped.filter((item) =>
    [item.title, item.project, item.content, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function sortItemsForDisplay(items: ItemRecord[]) {
  return [...items].sort((a, b) => {
    const doingRank = Number(b.status === "doing") - Number(a.status === "doing");
    if (doingRank !== 0) {
      return doingRank;
    }

    const priorityRank = a.priority - b.priority;
    if (priorityRank !== 0) {
      return priorityRank;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function itemCalendarDate(item: ItemRecord) {
  if (item.status === "done" && item.completedAt) {
    return item.completedAt.slice(0, 10);
  }
  return (item.scheduledDate || item.dueDate || item.updatedAt || item.createdAt).slice(0, 10);
}

function statusChangeDate(events: StatusEventRecord[], itemId: string, toStatus: ItemRecord["status"]) {
  return events.find((event) => event.itemId === itemId && event.toStatus === toStatus)?.createdAt.slice(0, 10);
}

function itemArchivedAt(item: ItemRecord, events: StatusEventRecord[]) {
  const archivedEvents = events
    .filter((event) => event.itemId === item.id && event.toStatus === "archived")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return archivedEvents[0]?.createdAt ?? item.updatedAt;
}

function doingItemsForDate(items: ItemRecord[], events: StatusEventRecord[], date: string) {
  const today = todayInputDate();
  if (date > today) {
    return [];
  }

  return items.filter((item) => {
    const doingStart = statusChangeDate(events, item.id, "doing");
    if (!doingStart) {
      return item.status === "doing" && itemCalendarDate(item) <= date;
    }

    const doneDate =
      statusChangeDate(events, item.id, "done") ||
      (item.status === "done" && item.completedAt ? item.completedAt.slice(0, 10) : null);

    return date >= doingStart && (!doneDate || date < doneDate);
  });
}

function weekdayLabels(weekStartsOn: CalendarWeekStartsOn) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return weekStartsOn === "monday" ? [...labels.slice(1), labels[0]] : labels;
}

function buildMonthCalendar(
  month: string,
  items: ItemRecord[],
  schedules: ScheduleRecord[],
  events: StatusEventRecord[],
  weekStartsOn: CalendarWeekStartsOn,
) {
  const start = parseDateKey(`${month}-01`);
  const firstVisible = new Date(start);
  const firstDay = weekStartsOn === "monday" ? 1 : 0;
  const offset = (firstVisible.getDay() - firstDay + 7) % 7;
  firstVisible.setDate(firstVisible.getDate() - offset);

  return Array.from({ length: 42 }, (_, index): CalendarDay => {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    const key = formatDateKey(date);

    return {
      date: key,
      day: date.getDate(),
      inMonth: key.startsWith(month),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      schedules: schedules.filter((schedule) => schedule.scheduleDate === key),
      doing: doingItemsForDate(items, events, key),
      done: items.filter((item) => item.status === "done" && itemCalendarDate(item) === key),
    };
  });
}

function scheduledWithinDays(schedules: ScheduleRecord[], startDate: string, days: number) {
  const endDate = addDays(startDate, days - 1);
  return schedules
    .filter((schedule) => schedule.scheduleDate >= startDate && schedule.scheduleDate <= endDate)
    .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
}

function groupSchedulesByDay(schedules: ScheduleRecord[], startDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      date,
      schedules: schedules
        .filter((schedule) => schedule.scheduleDate === date)
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
  });
}

function priorityLabel(priority: number) {
  return PRIORITY_LABELS[priority] ?? `P${priority}`;
}

function FeedbackBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const tone =
    value === "Active" || value === "Ready"
      ? "active"
      : value === "Error" || value === "Dead"
        ? "error"
        : value === "Disabled"
          ? "muted"
          : "idle";

  return <span className={`dot ${tone}`}>{label}: {value}</span>;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" && payload.error ? payload.error : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function AppShell({ initialData }: Props) {
  const [bootstrap, setBootstrap] = useState(initialData);
  const [activeTab, setActiveTab] = useState<AppTab>("inbox");
  const [feedback, setFeedbackText] = useState("Ready");
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>("info");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authDraft, setAuthDraft] = useState<AuthDraft>({ email: "", password: "" });
  const [selectedDate, setSelectedDate] = useState(todayInputDate());
  const [calendarMonth, setCalendarMonth] = useState(monthInputDate(todayInputDate()));
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    title: "",
    notes: "",
    scheduleDate: todayInputDate(),
  });
  const [settingsDraft, setSettingsDraft] = useState<UserSettingsRecord>(initialData.settings);
  const [adminDraft, setAdminDraft] = useState<Partial<AdminVariableRecord>>({
    key: "",
    value: "",
    description: "",
  });
  const [worklogDraft, setWorklogDraft] = useState<WorklogDraftState>({
    logDate: initialData.worklogs[0]?.logDate ?? null,
    title: initialData.worklogs[0]?.title ?? null,
    contentMd: initialData.worklogs[0]?.contentMd ?? "",
    contextSummary: initialData.worklogs[0]?.sourceSummary ?? {},
    savedId: initialData.worklogs[0]?.id ?? null,
    statusText: initialData.worklogs[0] ? `Saved #${initialData.worklogs[0].id}` : "",
  });
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFeedback(text: string, level: FeedbackLevel = "info") {
    setFeedbackText(text);
    setFeedbackLevel(level);

    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
    }

    if (!text || level === "busy") {
      return;
    }

    feedbackTimer.current = setTimeout(() => {
      setFeedbackText("");
      setFeedbackLevel("info");
    }, 30000);
  }

  async function refreshBootstrap() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to refresh data");
    }
    const payload = (await response.json()) as BootstrapPayload;
    setBootstrap(payload);
  }

  async function refreshStatus() {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const status = await response.json();
    setBootstrap((current) => ({ ...current, status }));
  }

  async function runBusy<T>(key: string, task: () => Promise<T>) {
    if (busyKey) {
      return null;
    }

    setBusyKey(key);
    try {
      return await task();
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => {
      clearInterval(timer);
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setSettingsDraft(bootstrap.settings);
  }, [bootstrap.settings]);

  const visibleItems = sortItemsForDisplay(filterItems(bootstrap.items, activeTab, filter));
  const filteredOutCount =
    activeTab === "worklogs" ||
    activeTab === "schedule" ||
    activeTab === "calendar" ||
    activeTab === "settings" ||
    activeTab === "admin"
      ? 0
      : filterItems(bootstrap.items, activeTab, "").length - visibleItems.length;
  const monthDays = buildMonthCalendar(
    calendarMonth,
    bootstrap.items,
    bootstrap.schedules,
    bootstrap.events,
    bootstrap.settings.calendarWeekStartsOn,
  );
  const calendarWeekdays = weekdayLabels(bootstrap.settings.calendarWeekStartsOn);
  const upcomingSchedules = scheduledWithinDays(bootstrap.schedules, selectedDate, 7);
  const upcomingScheduleGroups = groupSchedulesByDay(bootstrap.schedules, selectedDate, 7);
  const archivedItems = bootstrap.items
    .filter((item) => item.status === "archived")
    .sort((a, b) => itemArchivedAt(b, bootstrap.events).localeCompare(itemArchivedAt(a, bootstrap.events)));

  function toggleSelection(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  async function sendCommand() {
    await runBusy("sendCommand", async () => {
      setFeedback("Processing command…", "busy");
      const response = await fetch("/api/chat/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: commandInput,
          selectedItemIds: selectedIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to process command");
      }

      const result = await response.json();
      await refreshBootstrap();
      setSelectedIds([]);
      setCommandInput("");

      if (result.worklogDraft) {
        setWorklogDraft({
          logDate: result.worklogDraft.logDate,
          title: result.worklogDraft.title,
          contentMd: result.worklogDraft.contentMd,
          contextSummary: result.worklogDraft.contextSummary,
          savedId: null,
          statusText: "Draft — not saved",
        });
        setActiveTab("worklogs");
      }

      setFeedback(result.router.userFeedback || "Command processed", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to process command", "error");
    });
  }

  async function updateItemStatus(itemId: string, status: ItemRecord["status"]) {
    await runBusy(`status-${itemId}`, async () => {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          status,
          completedAt: status === "done" ? new Date().toISOString() : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      await refreshBootstrap();
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to update status", "error");
    });
  }

  async function updateItemHorizon(itemId: string, horizon: ItemRecord["horizon"]) {
    await runBusy(`horizon-${itemId}`, async () => {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          horizon,
          status: "todo",
          completedAt: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update horizon");
      }

      await refreshBootstrap();
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to update horizon", "error");
    });
  }

  async function saveEditingDraft() {
    if (!editingDraft) {
      return;
    }

    await runBusy(`save-${editingDraft.id}`, async () => {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingDraft),
      });

      if (!response.ok) {
        throw new Error("Failed to save item");
      }

      setEditingDraft(null);
      await refreshBootstrap();
      setFeedback("Item updated", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to save item", "error");
    });
  }

  async function removeItem(itemId: string) {
    await runBusy(`delete-${itemId}`, async () => {
      const response = await fetch("/api/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      setEditingDraft(null);
      setSelectedIds((current) => current.filter((id) => id !== itemId));
      await refreshBootstrap();
      setFeedback("Item deleted", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to delete item", "error");
    });
  }

  async function generateWorklog() {
    await runBusy("generateWorklog", async () => {
      setFeedback("Generating work log draft…", "busy");
      const response = await fetch("/api/worklogs/generate", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate worklog");
      }

      const draft = await response.json();
      setWorklogDraft({
        logDate: draft.logDate,
        title: draft.title,
        contentMd: draft.contentMd,
        contextSummary: draft.contextSummary,
        savedId: null,
        statusText: "Draft — not saved",
      });
      setFeedback("Draft ready", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to generate worklog", "error");
    });
  }

  async function saveWorklog() {
    await runBusy("saveWorklog", async () => {
      if (!worklogDraft.logDate || !worklogDraft.title || !worklogDraft.contentMd) {
        throw new Error("No worklog draft to save");
      }

      const response = await fetch("/api/worklogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logDate: worklogDraft.logDate,
          title: worklogDraft.title,
          contentMd: worklogDraft.contentMd,
          contextSummary: worklogDraft.contextSummary,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save worklog");
      }

      const saved = await response.json();
      setWorklogDraft((current) => ({
        ...current,
        savedId: saved.id,
        statusText: `Saved #${saved.id}`,
      }));
      await refreshBootstrap();
      setFeedback("Worklog saved", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to save worklog", "error");
    });
  }

  async function submitAuth() {
    await runBusy("auth", async () => {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authDraft),
      });

      if (!response.ok) {
        throw new Error("Authentication failed");
      }

      const result = (await response.json()) as { needsConfirmation?: boolean };
      if (authMode === "signup") {
        setAuthMode("login");
        setAuthDraft({ email: authDraft.email, password: "" });
      }
      await refreshBootstrap();
      setFeedback(
        result.needsConfirmation
          ? "Account created. Check your email to confirm login."
          : authMode === "login"
            ? "Logged in"
            : "Account created",
        "success",
      );
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Authentication failed", "error");
    });
  }

  function toggleAuthMode() {
    setAuthMode((mode) => (mode === "login" ? "signup" : "login"));
    setAuthDraft({ email: "", password: "" });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshBootstrap();
    setActiveTab("inbox");
    setFeedback("Logged out", "success");
  }

  async function createScheduleEntry() {
    await runBusy("createSchedule", async () => {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleDraft),
      });

      if (!response.ok) {
        throw new Error("Failed to create schedule");
      }

      setScheduleDraft({ title: "", notes: "", scheduleDate: todayInputDate() });
      await refreshBootstrap();
      setFeedback("Schedule added", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to create schedule", "error");
    });
  }

  async function removeSchedule(id: string) {
    await runBusy(`schedule-${id}`, async () => {
      const response = await fetch("/api/schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete schedule");
      }

      await refreshBootstrap();
      setFeedback("Schedule deleted", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to delete schedule", "error");
    });
  }

  async function saveSettings() {
    await runBusy("settings", async () => {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settingsDraft,
          worklogExportPath: "",
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to save settings"));
      }

      await refreshBootstrap();
      setFeedback("Settings saved", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to save settings", "error");
    });
  }

  async function saveAdminVariable() {
    await runBusy("admin", async () => {
      const response = await fetch("/api/admin/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminDraft),
      });

      if (!response.ok) {
        throw new Error("Failed to save variable");
      }

      setAdminDraft({ key: "", value: "", description: "" });
      await refreshBootstrap();
      setFeedback("Variable saved", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to save variable", "error");
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>ScaffoldOrganizer</h1>
          <p className="feedback" data-level={feedbackLevel}>{feedback}</p>
          <p className="meta">
            {bootstrap.user ? `${bootstrap.settings.nickname || bootstrap.user.email}` : "Signed out"}
          </p>
        </div>
        {bootstrap.user ? (
          <div className="top-actions">
            <button
              className="export-action"
              onClick={() =>
                downloadText(
                  `scaffold-export-${new Date().toISOString().slice(0, 10)}.md`,
                  buildExportMarkdown(bootstrap.items, bootstrap.schedules, bootstrap.worklogs),
                )
              }
              disabled={busyKey !== null}
            >
              Download
            </button>
            <button onClick={() => setActiveTab("settings")} disabled={busyKey !== null}>Settings</button>
            {bootstrap.user.isAdmin ? (
              <button onClick={() => setActiveTab("admin")} disabled={busyKey !== null}>Admin</button>
            ) : null}
            <button onClick={() => void logout()} disabled={busyKey !== null}>Logout</button>
          </div>
        ) : null}
      </header>

      {!bootstrap.user ? (
        <section className="auth-panel">
          <h2>{authMode === "login" ? "Login" : "Sign up"}</h2>
          <input
            type="email"
            placeholder="email"
            value={authDraft.email}
            onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })}
          />
          <input
            type="password"
            placeholder="password"
            value={authDraft.password}
            onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })}
          />
          <div className="card-actions">
            <button onClick={() => void submitAuth()} disabled={busyKey !== null}>
              {authMode === "login" ? "Login" : "Create account"}
            </button>
            <button onClick={toggleAuthMode}>
              {authMode === "login" ? "Need account?" : "Have account?"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="workspace">
            <nav className="tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <section className="panel">
              {activeTab !== "worklogs" && activeTab !== "schedule" && activeTab !== "calendar" && activeTab !== "settings" && activeTab !== "admin" ? (
                <>
                  <div className="panel-toolbar">
                    <input
                      type="search"
                      placeholder="Filter items (title, project, tag)…"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                    <span className="meta">
                      {filteredOutCount > 0
                        ? `${visibleItems.length} shown / ${visibleItems.length + filteredOutCount} total`
                        : `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`}
                    </span>
                  </div>

                  <div className="item-grid">
                    {visibleItems.map((item) => {
                      const selected = selectedIds.includes(item.id);
                      const editing = editingDraft?.id === item.id;

                      return (
                        <article
                          key={item.id}
                          className={`item-card status-${item.status} priority-${item.priority}`}
                        >
                          {editing && editingDraft ? (
                            <>
                              <header className="card-head">
                                <input
                                  className="edit-title"
                                  value={editingDraft.title}
                                  onChange={(event) =>
                                    setEditingDraft({
                                      ...editingDraft,
                                      title: event.target.value,
                                    })
                                  }
                                />
                              </header>
                              <div className="edit-priority-row">
                                {[1, 2, 3, 4, 5].map((priority) => (
                                  <button
                                    key={priority}
                                    type="button"
                                    className={`priority-btn${editingDraft.priority === priority ? " active" : ""}`}
                                    data-priority={priority}
                                    onClick={() =>
                                      setEditingDraft({
                                        ...editingDraft,
                                        priority,
                                      })
                                    }
                                  >
                                    P{priority}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                className="edit-content"
                                rows={3}
                                value={editingDraft.content}
                                onChange={(event) =>
                                  setEditingDraft({
                                    ...editingDraft,
                                    content: event.target.value,
                                  })
                                }
                              />
                              <footer className="card-actions">
                                <button onClick={() => void saveEditingDraft()}>Save</button>
                                <button onClick={() => setEditingDraft(null)}>Cancel</button>
                                <button className="danger" onClick={() => void removeItem(item.id)}>
                                  Delete
                                </button>
                              </footer>
                            </>
                          ) : (
                            <>
                              <header className="card-head">
                                <input
                                  className="select-box"
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSelection(item.id)}
                                />
                                <h3 title={`${item.itemType} · ${item.horizon}`}>{item.title}</h3>
                                {item.status === "doing" ? <span className="status-pill">DOING</span> : null}
                                <span className={`priority-chip p${item.priority}`} title={priorityLabel(item.priority)}>
                                  P{item.priority}
                                </span>
                              </header>
                              {item.content && item.content !== item.title ? (
                                <p className="card-body">{item.content}</p>
                              ) : null}
                              <footer className="card-actions">
                                {item.status === "inbox" && item.horizon !== "long_term" ? (
                                  <button onClick={() => void updateItemStatus(item.id, "todo")}>Active</button>
                                ) : null}
                                {item.status === "inbox" || item.status === "todo" ? (
                                  <button onClick={() => void updateItemStatus(item.id, "doing")}>Doing</button>
                                ) : null}
                                {item.status === "doing" ? (
                                  <button onClick={() => void updateItemStatus(item.id, "todo")}>Pause</button>
                                ) : null}
                                {item.status !== "done" && item.status !== "archived" && item.horizon !== "long_term" ? (
                                  <button onClick={() => void updateItemHorizon(item.id, "long_term")}>Long-term</button>
                                ) : null}
                                {item.status !== "done" && item.status !== "archived" && item.horizon === "long_term" ? (
                                  <button onClick={() => void updateItemHorizon(item.id, "now")}>Active</button>
                                ) : null}
                                {item.status !== "done" && item.status !== "archived" ? (
                                  <button onClick={() => void updateItemStatus(item.id, "done")}>Done</button>
                                ) : null}
                                {item.status !== "archived" ? (
                                  <button
                                    className="trash-btn"
                                    title="Archive"
                                    aria-label="Archive"
                                    onClick={() => void updateItemStatus(item.id, "archived")}
                                  >
                                    🗑
                                  </button>
                                ) : null}
                                <button
                                  className="icon-btn"
                                  onClick={() =>
                                    setEditingDraft({
                                      id: item.id,
                                      title: item.title,
                                      content: item.content,
                                      priority: item.priority,
                                    })
                                  }
                                >
                                  Edit
                                </button>
                              </footer>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {activeTab === "schedule" ? (
                <div className="split">
                  <div className="schedule-form">
                    <input
                      placeholder="Schedule title"
                      value={scheduleDraft.title}
                      onChange={(event) => setScheduleDraft({ ...scheduleDraft, title: event.target.value })}
                    />
                    <input
                      type="date"
                      value={scheduleDraft.scheduleDate}
                      onChange={(event) => setScheduleDraft({ ...scheduleDraft, scheduleDate: event.target.value })}
                    />
                    <textarea
                      placeholder="Notes"
                      value={scheduleDraft.notes}
                      onChange={(event) => setScheduleDraft({ ...scheduleDraft, notes: event.target.value })}
                    />
                    <button onClick={() => void createScheduleEntry()} disabled={busyKey !== null || !scheduleDraft.title.trim()}>
                      Add Schedule
                    </button>
                  </div>
                  <div className="list">
                    {bootstrap.schedules.map((schedule) => (
                      <div key={schedule.id} className="list-entry schedule-entry">
                        <strong>{schedule.scheduleDate} · {schedule.title}</strong>
                        {schedule.notes ? <p>{schedule.notes}</p> : null}
                        <div className="card-actions">
                          <button className="danger" onClick={() => void removeSchedule(schedule.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === "calendar" ? (
                <div className="calendar-page">
                  <div className="calendar-toolbar">
                    <input
                      type="month"
                      value={calendarMonth}
                      onChange={(event) => setCalendarMonth(event.target.value)}
                    />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => {
                        setSelectedDate(event.target.value);
                        setCalendarMonth(monthInputDate(event.target.value));
                      }}
                    />
                    <button
                      onClick={() => {
                        const today = todayInputDate();
                        setSelectedDate(today);
                        setCalendarMonth(monthInputDate(today));
                      }}
                    >
                      Today
                    </button>
                  </div>
                  <div className="month-calendar">
                    {calendarWeekdays.map((day) => (
                      <div
                        key={day}
                        className={`calendar-weekday${day === "Sun" || day === "Sat" ? " weekend" : ""}`}
                      >
                        {day}
                      </div>
                    ))}
                    {monthDays.map((day) => (
                      <button
                        key={day.date}
                        className={`month-day${day.inMonth ? "" : " outside"}${day.isWeekend ? " weekend" : ""}${day.date === selectedDate ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedDate(day.date);
                          setCalendarMonth(monthInputDate(day.date));
                        }}
                      >
                        <div className="month-day-head">
                          <strong>{day.day}</strong>
                          <span className="day-counters">
                            <span>● {day.doing.length}</span>
                            <span>✓ {day.done.length}</span>
                          </span>
                        </div>
                        <div className="calendar-events">
                          {day.schedules.slice(0, 3).map((schedule) => (
                            <span key={schedule.id} className="calendar-event" title={schedule.title}>
                              {schedule.title}
                            </span>
                          ))}
                          {day.schedules.length > 3 ? (
                            <span className="calendar-more">+{day.schedules.length - 3} more</span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                  <section className="upcoming-panel">
                    <h2>{selectedDate}부터 7일 일정</h2>
                    {upcomingSchedules.length ? (
                      upcomingScheduleGroups.map((group) => (
                        <section key={group.date} className="upcoming-day">
                          <h3>{group.date}</h3>
                          {group.schedules.length ? (
                            group.schedules.map((schedule) => (
                              <article key={schedule.id} className="list-entry">
                                <strong>{schedule.title}</strong>
                                {schedule.notes ? <p>{schedule.notes}</p> : null}
                              </article>
                            ))
                          ) : (
                            <p className="meta">예정된 일정 없음</p>
                          )}
                        </section>
                      ))
                    ) : (
                      <p className="meta">선택한 날짜부터 7일간 예정된 일정이 없습니다.</p>
                    )}
                  </section>
                </div>
              ) : null}

              {activeTab === "worklogs" ? (
                <div className="split">
                  <div className="editor-column">
                    <div className="card-actions top-actions-inline">
                      <button onClick={() => void generateWorklog()} disabled={busyKey !== null}>
                        Generate Draft
                      </button>
                      <span className="meta">{worklogDraft.statusText}</span>
                    </div>
                    <textarea
                      className="worklog-editor"
                      placeholder="Worklog draft"
                      value={worklogDraft.contentMd}
                      onChange={(event) =>
                        setWorklogDraft((current) => ({
                          ...current,
                          contentMd: event.target.value,
                          savedId: null,
                          statusText: "Draft — edited",
                        }))
                      }
                    />
                    <div className="card-actions">
                      <button onClick={() => void saveWorklog()} disabled={busyKey !== null}>
                        Save
                      </button>
                      <button
                        onClick={() => {
                          if (!worklogDraft.contentMd) {
                            return;
                          }
                          downloadText(
                            `${(worklogDraft.title ?? "worklog").replaceAll(" ", "-").toLowerCase()}.md`,
                            worklogDraft.contentMd,
                          );
                        }}
                        disabled={busyKey !== null}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                  <div className="list">
                    {bootstrap.worklogs.map((worklog) => (
                      <div
                        key={worklog.id}
                        className="list-entry"
                        onClick={() =>
                          setWorklogDraft({
                            logDate: worklog.logDate,
                            title: worklog.title,
                            contentMd: worklog.contentMd,
                            contextSummary: worklog.sourceSummary,
                            savedId: worklog.id,
                            statusText: `Saved #${worklog.id}`,
                          })
                        }
                      >
                        <strong>{worklog.title}</strong>
                        <div className="meta">{worklog.createdAt}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === "settings" ? (
                <div className="settings-panel">
                  <label>
                    Nickname
                    <input
                      value={settingsDraft.nickname}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, nickname: event.target.value })}
                    />
                  </label>
                  <label>
                    Personal prompt
                    <textarea
                      value={settingsDraft.customPrompt}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, customPrompt: event.target.value })}
                    />
                  </label>
                  <label>
                    Calendar week starts on
                    <select
                      value={settingsDraft.calendarWeekStartsOn}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          calendarWeekStartsOn: event.target.value as CalendarWeekStartsOn,
                        })
                      }
                    >
                      <option value="monday">Monday</option>
                      <option value="sunday">Sunday</option>
                    </select>
                  </label>
                  <div className="status-strip settings-status">
                    <FeedbackBadge label="Backend" value={bootstrap.status.backend} />
                    <FeedbackBadge label="AI" value={bootstrap.status.ai} />
                    <span className="dot idle">Storage: {bootstrap.usingSupabase ? "Supabase" : "Demo"}</span>
                  </div>
                  <div className="card-actions">
                    <button onClick={() => void saveSettings()} disabled={busyKey !== null}>Save Settings</button>
                    <button onClick={() => window.open("/help", "_blank", "noopener,noreferrer")}>
                      User Guide
                    </button>
                  </div>
                  <section className="archive-list">
                    <h2>Archived items</h2>
                    <p className="meta">Archived items are permanently deleted after 10 days.</p>
                    {archivedItems.length ? (
                      archivedItems.map((item) => (
                        <article key={item.id} className="list-entry archive-entry">
                          <div>
                            <strong>{item.title}</strong>
                            <p className="meta">Archived at {itemArchivedAt(item, bootstrap.events).slice(0, 10)}</p>
                          </div>
                          <button onClick={() => void updateItemStatus(item.id, "inbox")} disabled={busyKey !== null}>
                            Restore
                          </button>
                        </article>
                      ))
                    ) : (
                      <p className="meta">No archived items.</p>
                    )}
                  </section>
                  <details className="app-info">
                    <summary>App info</summary>
                    <p className="meta">Prompt roles: {bootstrap.prompts.map((prompt) => `${prompt.role} (${prompt.model})`).join(", ")}</p>
                  </details>
                </div>
              ) : null}

              {activeTab === "admin" && bootstrap.user?.isAdmin ? (
                <div className="split">
                  <div className="settings-panel">
                    <input
                      placeholder="Variable key"
                      value={adminDraft.key ?? ""}
                      onChange={(event) => setAdminDraft({ ...adminDraft, key: event.target.value })}
                    />
                    <textarea
                      placeholder="Value"
                      value={adminDraft.value ?? ""}
                      onChange={(event) => setAdminDraft({ ...adminDraft, value: event.target.value })}
                    />
                    <input
                      placeholder="Description"
                      value={adminDraft.description ?? ""}
                      onChange={(event) => setAdminDraft({ ...adminDraft, description: event.target.value })}
                    />
                    <button onClick={() => void saveAdminVariable()} disabled={busyKey !== null || !adminDraft.key}>
                      Save Variable
                    </button>
                  </div>
                  <div className="list">
                    {bootstrap.adminVariables.map((entry) => (
                      <div key={entry.id} className="list-entry" onClick={() => setAdminDraft(entry)}>
                        <strong>{entry.key}</strong>
                        <div className="meta">{entry.description}</div>
                        <p>{entry.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </section>

          <footer className="command-bar">
            <textarea
              placeholder="Paste a brain dump, capture a thought, or issue a command."
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendCommand();
                }
              }}
            />
            <button onClick={() => void sendCommand()} disabled={busyKey !== null || !commandInput.trim()}>
              Send
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
