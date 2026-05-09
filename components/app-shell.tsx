"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AppTab,
  AdminVariableRecord,
  BootstrapPayload,
  ItemRecord,
  ScheduleRecord,
  SessionRecord,
  UserSettingsRecord,
  WorklogRecord,
} from "@/lib/types";

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "inbox", label: "Inbox" },
  { id: "active", label: "Active" },
  { id: "longterm", label: "Long-term" },
  { id: "schedule", label: "Schedule" },
  { id: "calendar", label: "Calendar" },
  { id: "sessions", label: "Sessions" },
  { id: "worklogs", label: "Work Log" },
  { id: "settings", label: "Settings" },
  { id: "admin", label: "Admin" },
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

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
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

function buildExportMarkdown(items: ItemRecord[], sessions: SessionRecord[], worklogs: WorklogRecord[]) {
  return [
    "# ScaffoldOrganizer Export",
    "",
    "## Items",
    ...items.map((item) => `- [${item.status}] ${item.title}`),
    "",
    "## Sessions",
    ...sessions.map((session) => `- ${session.title}`),
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
    scoped = items.filter((item) => item.horizon === "long_term");
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

function calendarDays(items: ItemRecord[], schedules: ScheduleRecord[], worklogs: WorklogRecord[]) {
  const map = new Map<string, { date: string; items: ItemRecord[]; schedules: ScheduleRecord[]; worklogs: WorklogRecord[] }>();
  const ensure = (date: string) => {
    const key = date.slice(0, 10);
    if (!map.has(key)) {
      map.set(key, { date: key, items: [], schedules: [], worklogs: [] });
    }
    return map.get(key)!;
  };

  for (const item of items) {
    ensure(item.scheduledDate || item.dueDate || item.createdAt).items.push(item);
  }
  for (const schedule of schedules) {
    ensure(schedule.scheduleDate).schedules.push(schedule);
  }
  for (const worklog of worklogs) {
    ensure(worklog.logDate).worklogs.push(worklog);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
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

export function AppShell({ initialData }: Props) {
  const [bootstrap, setBootstrap] = useState(initialData);
  const [activeTab, setActiveTab] = useState<AppTab>("inbox");
  const [feedback, setFeedbackText] = useState("Ready");
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>("info");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [brainDump, setBrainDump] = useState(initialData.sessions[0]?.rawText ?? "");
  const [structuredOutput, setStructuredOutput] = useState(initialData.sessions[0]?.structuredText ?? "");
  const [sessionTitle, setSessionTitle] = useState(initialData.sessions[0]?.title ?? "");
  const [commandInput, setCommandInput] = useState("");
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authDraft, setAuthDraft] = useState<AuthDraft>({ email: "", password: "" });
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

  const visibleItems = filterItems(bootstrap.items, activeTab, filter);
  const calendarEntries = calendarDays(bootstrap.items, bootstrap.schedules, bootstrap.worklogs);

  function toggleSelection(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function loadSessionIntoEditor(session: SessionRecord) {
    setBrainDump(session.rawText);
    setStructuredOutput(session.structuredText);
    setSessionTitle(session.title);
    setFeedback(`Loaded session ${session.title}`, "success");
  }

  async function saveSessionEditor() {
    await runBusy("saveSession", async () => {
      setFeedback("Saving session…", "busy");
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle || "Manual session",
          rawText: brainDump,
          structuredText: structuredOutput,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save session");
      }

      await refreshBootstrap();
      setFeedback("Session saved", "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to save session", "error");
    });
  }

  async function structureBrainDump() {
    await runBusy("structureBrainDump", async () => {
      setFeedback("Structuring brain dump…", "busy");
      const response = await fetch("/api/sessions/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle || "Brain dump",
          rawText: brainDump,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to structure brain dump");
      }

      const result = await response.json();
      setStructuredOutput(result.structuredText);
      await refreshBootstrap();
      setFeedback(`Structured into ${result.items.length} item(s)`, "success");
    }).catch((error: unknown) => {
      setFeedback(error instanceof Error ? error.message : "Failed to structure brain dump", "error");
    });
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
      setActiveTab("worklogs");
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshBootstrap();
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
        body: JSON.stringify(settingsDraft),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
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

  const filteredOutCount =
    activeTab === "sessions" || activeTab === "worklogs" || activeTab === "schedule" || activeTab === "calendar" || activeTab === "settings" || activeTab === "admin"
      ? 0
      : filterItems(bootstrap.items, activeTab, "").length - visibleItems.length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>ScaffoldOrganizer 2.0</h1>
          <p className="feedback" data-level={feedbackLevel}>{feedback}</p>
          <p className="meta">
            {bootstrap.user ? `${bootstrap.settings.nickname || bootstrap.user.email}` : "Signed out"} · {bootstrap.usingSupabase ? "Supabase" : "Demo"}
          </p>
        </div>
        <div className="status-strip">
          <FeedbackBadge label="Backend" value={bootstrap.status.backend} />
          <FeedbackBadge label="AI" value={bootstrap.status.ai} />
          {bootstrap.user ? (
            <button onClick={() => void logout()} disabled={busyKey !== null}>Logout</button>
          ) : null}
        </div>
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
            <button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login" ? "Need account?" : "Have account?"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="toolbar">
        <button onClick={() => void saveSessionEditor()} disabled={busyKey !== null}>
          Save
        </button>
        <button
          onClick={() => {
            if (bootstrap.sessions.length === 0) {
              setFeedback("No saved sessions yet.", "info");
              return;
            }
            if (bootstrap.sessions.length === 1) {
              loadSessionIntoEditor(bootstrap.sessions[0]);
              return;
            }
            setSessionPickerOpen(true);
          }}
          disabled={busyKey !== null}
        >
          Load
        </button>
        <button
          onClick={() => {
            setBrainDump("");
            setStructuredOutput("");
            setSessionTitle("");
            setWorklogDraft((current) => ({
              ...current,
              contentMd: "",
              logDate: null,
              title: null,
              savedId: null,
              statusText: "",
            }));
            setFeedback("Editor state cleared", "success");
          }}
          disabled={busyKey !== null}
        >
          Reset
        </button>
        <button
          onClick={() =>
            downloadText(
              `scaffold-export-${new Date().toISOString().slice(0, 10)}.md`,
              buildExportMarkdown(bootstrap.items, bootstrap.sessions, bootstrap.worklogs),
            )
          }
          disabled={busyKey !== null}
        >
          Export
        </button>
        <button onClick={() => void generateWorklog()} disabled={busyKey !== null}>
          Work Log
        </button>
      </section>

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
          {activeTab !== "sessions" && activeTab !== "worklogs" && activeTab !== "schedule" && activeTab !== "calendar" && activeTab !== "settings" && activeTab !== "admin" ? (
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
                            {item.status === "inbox" ? (
                              <button onClick={() => void updateItemStatus(item.id, "todo")}>→ Active</button>
                            ) : null}
                            {item.status === "inbox" || item.status === "todo" ? (
                              <button onClick={() => void updateItemStatus(item.id, "doing")}>Doing</button>
                            ) : null}
                            {item.status === "doing" ? (
                              <button onClick={() => void updateItemStatus(item.id, "todo")}>Pause</button>
                            ) : null}
                            {item.status !== "done" && item.status !== "archived" ? (
                              <button onClick={() => void updateItemStatus(item.id, "done")}>Done</button>
                            ) : null}
                            {item.status !== "archived" ? (
                              <button onClick={() => void updateItemStatus(item.id, "archived")}>🗑</button>
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
                              ✎
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
            <div className="calendar-grid">
              {calendarEntries.map((day) => (
                <article key={day.date} className="calendar-day">
                  <h3>{day.date}</h3>
                  {day.schedules.map((schedule) => (
                    <p key={schedule.id}><span className="mini-chip sky">S</span>{schedule.title}</p>
                  ))}
                  {day.items.map((item) => (
                    <p key={item.id}><span className="mini-chip gray">T</span>{item.title}</p>
                  ))}
                  {day.worklogs.map((worklog) => (
                    <p key={worklog.id}><span className="mini-chip mint">W</span>{worklog.title}</p>
                  ))}
                </article>
              ))}
            </div>
          ) : null}

          {activeTab === "sessions" ? (
            <div className="split">
              <div className="editor-column">
                <textarea
                  placeholder="Brain dump"
                  value={brainDump}
                  onChange={(event) => setBrainDump(event.target.value)}
                />
                <textarea
                  readOnly
                  placeholder="Structured markdown"
                  value={structuredOutput}
                />
              </div>
              <div className="stack">
                <input
                  placeholder="Session title"
                  value={sessionTitle}
                  onChange={(event) => setSessionTitle(event.target.value)}
                />
                <button onClick={() => void structureBrainDump()} disabled={busyKey !== null}>
                  Structure Brain Dump
                </button>
                <div className="list">
                  {bootstrap.sessions.map((session) => (
                    <div key={session.id} className="list-entry">
                      <strong>{session.title}</strong>
                      <div className="meta">{session.updatedAt}</div>
                      <div className="card-actions">
                        <button onClick={() => loadSessionIntoEditor(session)}>Load</button>
                        <button
                          onClick={() =>
                            downloadText(
                              `${session.title.replaceAll(" ", "-").toLowerCase()}.md`,
                              session.structuredText || session.rawText,
                            )
                          }
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "worklogs" ? (
            <div className="split">
              <div className="editor-column">
                <textarea
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
                    Save & Export
                  </button>
                  <span className="meta">{worklogDraft.statusText}</span>
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
                Worklog export path
                <input
                  value={settingsDraft.worklogExportPath}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, worklogExportPath: event.target.value })}
                />
              </label>
              <label>
                Personal prompt
                <textarea
                  value={settingsDraft.customPrompt}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, customPrompt: event.target.value })}
                />
              </label>
              <button onClick={() => void saveSettings()} disabled={busyKey !== null}>Save Settings</button>
            </div>
          ) : null}

          {activeTab === "admin" ? (
            bootstrap.user?.isAdmin ? (
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
            ) : (
              <p className="meta">Admin access required.</p>
            )
          ) : null}

          <p className="panel-footnote">
            Prompt roles: {bootstrap.prompts.map((prompt) => `${prompt.role} (${prompt.model})`).join(", ")}
          </p>
        </section>
      </section>

      <footer className="command-bar">
        <textarea
          placeholder="Capture a thought, create a task, or issue a command."
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

      {sessionPickerOpen ? (
        <div className="modal" onClick={() => setSessionPickerOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <h2>Load Session</h2>
              <button className="modal-close" onClick={() => setSessionPickerOpen(false)}>
                ×
              </button>
            </header>
            <p className="meta">Click an entry to restore raw and structured text.</p>
            <div className="list">
              {bootstrap.sessions.map((session) => (
                <div
                  key={session.id}
                  className="list-entry"
                  onClick={() => {
                    loadSessionIntoEditor(session);
                    setSessionPickerOpen(false);
                  }}
                >
                  <strong>{session.title}</strong>
                  <div className="meta">{session.updatedAt}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
