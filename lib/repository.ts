import { demoItems, demoSessions, demoStatus, demoWorklogs } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { PROMPT_REGISTRY } from "@/lib/prompts";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  BootstrapPayload,
  CommandPayload,
  ItemHorizon,
  ItemRecord,
  ItemSource,
  ItemStatus,
  ItemType,
  RouterAction,
  RouterResult,
  SessionRecord,
  StatusSnapshot,
  WorklogDraftResult,
  WorklogRecord,
} from "@/lib/types";

type ItemPatch = Partial<
  Pick<
    ItemRecord,
    "title" | "content" | "priority" | "status" | "horizon" | "completedAt"
  >
>;

interface DemoStore {
  items: ItemRecord[];
  sessions: SessionRecord[];
  worklogs: WorklogRecord[];
}

let demoStore: DemoStore = {
  items: clone(demoItems),
  sessions: clone(demoSessions),
  worklogs: clone(demoWorklogs),
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function mapItemRow(row: Record<string, unknown>): ItemRecord {
  return {
    id: String(row.id),
    itemType: row.item_type as ItemType,
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    status: row.status as ItemStatus,
    horizon: row.horizon as ItemHorizon,
    priority: Number(row.priority ?? 3),
    source: row.source as ItemSource,
    project: String(row.project ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    scheduledDate: (row.scheduled_date as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    completedAt: (row.completed_at as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    externalRef: (row.external_ref as string | null) ?? null,
  };
}

function mapSessionRow(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    rawText: String(row.raw_text ?? ""),
    structuredText: String(row.structured_text ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    exportMdPath: (row.export_md_path as string | null) ?? null,
  };
}

function mapWorklogRow(row: Record<string, unknown>): WorklogRecord {
  return {
    id: String(row.id),
    logDate: String(row.log_date ?? ""),
    title: String(row.title ?? ""),
    contentMd: String(row.content_md ?? ""),
    sourceSummary: (row.source_summary as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function classifyText(text: string): Pick<
  ItemRecord,
  "itemType" | "status" | "horizon" | "priority"
> {
  const trimmed = text.trim();
  if (trimmed.includes("장기") || trimmed.includes("나중")) {
    return {
      itemType: "task",
      status: "todo",
      horizon: "long_term",
      priority: 4,
    };
  }

  if (trimmed.includes("아이디어") || trimmed.includes("생각")) {
    return {
      itemType: "thought",
      status: "inbox",
      horizon: "soon",
      priority: 3,
    };
  }

  if (trimmed.includes("메모")) {
    return {
      itemType: "note",
      status: "inbox",
      horizon: "soon",
      priority: 3,
    };
  }

  return {
    itemType: "task",
    status: "inbox",
    horizon: "now",
    priority: 2,
  };
}

function buildStructuredMarkdown(lines: string[]) {
  const active = lines.filter((line) => !line.includes("장기") && !line.includes("나중"));
  const longTerm = lines.filter((line) => line.includes("장기") || line.includes("나중"));

  return [
    "## 🍎 브레인덤프 분류 및 구조화",
    "",
    "## 🥑 우선순위 조정 & 실행 원자화",
    "",
    "### 지금 할 일 (Active Now)",
    ...active.map((line) => `- ${line}`),
    "",
    "### 장기 보존 (Long-term Backlog)",
    ...(longTerm.length ? longTerm.map((line) => `- ${line}`) : ["- 장기 분류 항목 없음"]),
    "",
    "### 생각 / 메모 (Thought Fragments)",
    "- 필요 시 classifier prompt로 재분류",
  ].join("\n");
}

async function listItemsFromSupabase() {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.items);
  }

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapItemRow(row));
}

async function listSessionsFromSupabase() {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.sessions);
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapSessionRow(row));
}

async function listWorklogsFromSupabase() {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.worklogs);
  }

  const { data, error } = await supabase
    .from("worklogs")
    .select("*")
    .order("log_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapWorklogRow(row));
}

export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  if (!isSupabaseConfigured()) {
    return demoStatus;
  }

  return {
    backend: "Active",
    telegram: "Idle",
    ai: process.env.OPENAI_API_KEY ? "Ready" : "Local fallback",
  };
}

export async function getBootstrapPayload(): Promise<BootstrapPayload> {
  try {
    const [status, items, sessions, worklogs] = await Promise.all([
      getStatusSnapshot(),
      listItemsFromSupabase(),
      listSessionsFromSupabase(),
      listWorklogsFromSupabase(),
    ]);

    return {
      status,
      items,
      sessions,
      worklogs,
      prompts: PROMPT_REGISTRY,
      usingSupabase: isSupabaseConfigured(),
    };
  } catch (_error) {
    return {
      status: {
        backend: "Active",
        telegram: "Idle",
        ai: "Local fallback",
        aiError: "Supabase bootstrap failed. Falling back to demo store.",
      },
      items: clone(demoStore.items),
      sessions: clone(demoStore.sessions),
      worklogs: clone(demoStore.worklogs),
      prompts: PROMPT_REGISTRY,
      usingSupabase: false,
    };
  }
}

export async function listItems() {
  return listItemsFromSupabase();
}

export async function updateItem(id: string, patch: ItemPatch) {
  if (!isSupabaseConfigured()) {
    demoStore.items = demoStore.items.map((item) =>
      item.id === id
        ? {
            ...item,
            ...patch,
            updatedAt: isoNow(),
          }
        : item,
    );

    const nextItem = demoStore.items.find((item) => item.id === id);
    if (!nextItem) {
      throw new Error(`Item not found: ${id}`);
    }
    return clone(nextItem);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("items")
    .update({
      title: patch.title,
      content: patch.content,
      priority: patch.priority,
      status: patch.status,
      horizon: patch.horizon,
      completed_at: patch.completedAt,
      updated_at: isoNow(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapItemRow(data);
}

export async function deleteItem(id: string) {
  if (!isSupabaseConfigured()) {
    demoStore.items = demoStore.items.filter((item) => item.id !== id);
    return;
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createItem(input: {
  title: string;
  content?: string;
  source?: ItemSource;
  sessionId?: string | null;
}) {
  const classification = classifyText(input.content || input.title);
  const now = isoNow();

  const item: ItemRecord = {
    id: buildId("item"),
    itemType: classification.itemType,
    title: input.title,
    content: input.content ?? "",
    status: classification.status,
    horizon: classification.horizon,
    priority: classification.priority,
    source: input.source ?? "chat_input",
    project: "",
    tags: [],
    scheduledDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    sessionId: input.sessionId ?? null,
    externalRef: null,
  };

  if (!isSupabaseConfigured()) {
    demoStore.items.unshift(item);
    return clone(item);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      item_type: item.itemType,
      title: item.title,
      content: item.content,
      status: item.status,
      horizon: item.horizon,
      priority: item.priority,
      source: item.source,
      project: item.project,
      tags: item.tags,
      scheduled_date: item.scheduledDate,
      due_date: item.dueDate,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      completed_at: item.completedAt,
      session_id: item.sessionId,
      external_ref: item.externalRef,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapItemRow(data);
}

export async function listSessions() {
  return listSessionsFromSupabase();
}

export async function getSessionById(id: string) {
  if (!isSupabaseConfigured()) {
    const session = demoStore.sessions.find((entry) => entry.id === id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return clone(session);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSessionRow(data);
}

export async function saveSession(input: {
  title: string;
  rawText: string;
  structuredText: string;
}) {
  const session: SessionRecord = {
    id: buildId("session"),
    title: input.title,
    rawText: input.rawText,
    structuredText: input.structuredText,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    exportMdPath: null,
  };

  if (!isSupabaseConfigured()) {
    demoStore.sessions.unshift(session);
    return clone(session);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      title: session.title,
      raw_text: session.rawText,
      structured_text: session.structuredText,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      export_md_path: session.exportMdPath,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSessionRow(data);
}

export async function structureSession(input: { title: string; rawText: string }) {
  const lines = input.rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const structuredText = buildStructuredMarkdown(lines);
  const session = await saveSession({
    title: input.title,
    rawText: input.rawText,
    structuredText,
  });

  const createdItems: ItemRecord[] = [];
  for (const line of lines) {
    createdItems.push(
      await createItem({
        title: line.slice(0, 80),
        content: line,
        source: "brain_dump",
        sessionId: session.id,
      }),
    );
  }

  return {
    session,
    structuredText,
    items: createdItems,
    usedFallback: true,
  };
}

export async function listWorklogs() {
  return listWorklogsFromSupabase();
}

export async function saveWorklog(input: {
  logDate: string;
  title: string;
  contentMd: string;
  contextSummary: Record<string, unknown>;
}) {
  const worklog: WorklogRecord = {
    id: buildId("worklog"),
    logDate: input.logDate,
    title: input.title,
    contentMd: input.contentMd,
    sourceSummary: input.contextSummary,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };

  if (!isSupabaseConfigured()) {
    demoStore.worklogs.unshift(worklog);
    return clone(worklog);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("worklogs")
    .insert({
      log_date: worklog.logDate,
      title: worklog.title,
      content_md: worklog.contentMd,
      source_summary: worklog.sourceSummary,
      created_at: worklog.createdAt,
      updated_at: worklog.updatedAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapWorklogRow(data);
}

export async function generateWorklogDraft(): Promise<WorklogDraftResult> {
  const items = await listItems();
  const today = todayDate();
  const started = items.filter((item) => item.createdAt.slice(0, 10) === today);
  const doing = items.filter((item) => item.status === "doing");
  const done = items.filter((item) => item.status === "done");
  const deferred = items.filter((item) => item.horizon === "long_term" || item.status === "archived");
  const notes = items.filter((item) => item.itemType !== "task");
  const nextActions = items.filter(
    (item) =>
      item.status !== "done" &&
      item.status !== "archived" &&
      item.horizon !== "long_term",
  );

  const contentMd = [
    `# 📅 업무일지 — ${today}`,
    "",
    "---",
    "",
    "## 1. 🟢 오늘 착수한 작업 (Started)",
    ...(started.length ? started.map((item) => `- ${item.title}`) : ["- 신규 착수 항목 없음"]),
    "",
    "## 2. 🔵 진행 중인 작업 (In Progress)",
    ...(doing.length ? doing.map((item) => `- ${item.title}`) : ["- 진행 중 항목 없음"]),
    "",
    "## 3. ✅ 완료한 작업 (Completed)",
    ...(done.length ? done.map((item) => `- ${item.title}`) : ["- 완료 항목 없음"]),
    "",
    "## 4. ⏸ 보류 / 장기 전환 (Deferred / Long-term)",
    ...(deferred.length ? deferred.map((item) => `- ${item.title}`) : ["- 장기/보류 항목 없음"]),
    "",
    "## 5. 🧠 메모 및 관찰 (Notes & Observations)",
    ...(notes.length ? notes.map((item) => `- ${item.title}`) : ["- 메모 없음"]),
    "",
    "## 6. ⚠️ 이슈 / 블로커 (Issues / Blockers)",
    "- 수동 fallback 초안입니다. OpenAI adapter 연결 전까지는 DB 상태 기반으로만 생성됩니다.",
    "",
    "## 7. ▶️ 다음 액션 (Next Actions)",
    ...(nextActions.length ? nextActions.slice(0, 5).map((item) => `- ${item.title}`) : ["- 다음 액션 없음"]),
  ].join("\n");

  return {
    title: `업무일지 — ${today}`,
    logDate: today,
    contentMd,
    contextSummary: {
      started: started.map((item) => item.id),
      doing: doing.map((item) => item.id),
      done: done.map((item) => item.id),
    },
    usedFallback: true,
  };
}

function createRouterFeedback(actions: RouterAction[]) {
  if (actions.some((action) => action.type === "generate_worklog")) {
    return "업무일지 초안을 생성했습니다.";
  }
  if (actions.some((action) => action.type === "move_selected_item_to_long_term")) {
    return "선택 항목을 장기 과제로 이동했습니다.";
  }
  if (actions.some((action) => action.type === "create_item")) {
    return "입력을 새 항목으로 저장했습니다.";
  }
  return "명령을 처리했습니다.";
}

export async function runCommand(payload: CommandPayload) {
  const text = payload.text.trim();
  const actions: RouterAction[] = [];
  const lower = text.toLowerCase();
  let draft: WorklogDraftResult | null = null;

  if (!text) {
    return {
      router: {
        mode: "command",
        actions: [{ type: "no_op" }],
        userFeedback: "빈 입력입니다.",
      } satisfies RouterResult,
      worklogDraft: null,
    };
  }

  if (text.includes("장기") && payload.selectedItemIds.length > 0) {
    actions.push({ type: "move_selected_item_to_long_term" });
    await updateItem(payload.selectedItemIds[0], {
      status: "todo",
      horizon: "long_term",
      completedAt: null,
    });
  }

  if (text.includes("doing") || text.includes("진행")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_doing" });
      await updateItem(payload.selectedItemIds[0], {
        status: "doing",
        completedAt: null,
      });
    }
  }

  if (text.includes("완료") || lower.includes("done")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_done" });
      await updateItem(payload.selectedItemIds[0], {
        status: "done",
        completedAt: isoNow(),
      });
    }
  }

  if (text.includes("업무일지") || lower.includes("work log") || lower.includes("worklog")) {
    actions.push({ type: "generate_worklog" });
    draft = await generateWorklogDraft();
  }

  if (actions.length === 0) {
    actions.push({
      type: "create_item",
      payload: { text },
    });
    await createItem({
      title: text.slice(0, 80),
      content: text,
      source: "chat_input",
    });
  }

  const router: RouterResult = {
    mode:
      actions.some((action) => action.type === "create_item") && actions.length > 1
        ? "hybrid"
        : actions[0]?.type === "create_item"
          ? "content_capture"
          : "command",
    actions,
    userFeedback: createRouterFeedback(actions),
  };

  return {
    router,
    worklogDraft: draft,
  };
}
