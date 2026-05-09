import {
  demoAdminVariables,
  demoItems,
  demoSchedules,
  demoSessions,
  demoSettings,
  demoStatus,
  demoUser,
  demoWorklogs,
} from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  generateGeminiJson,
  generateGeminiText,
  isGeminiConfigured,
} from "@/lib/gemini";
import { PROMPT_REGISTRY } from "@/lib/prompts";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  BootstrapPayload,
  AdminVariableRecord,
  AuthUser,
  CommandPayload,
  ItemHorizon,
  ItemRecord,
  ItemSource,
  ItemStatus,
  ItemType,
  RouterAction,
  RouterResult,
  ScheduleRecord,
  SessionRecord,
  StatusSnapshot,
  UserSettingsRecord,
  WorklogDraftResult,
  WorklogRecord,
} from "@/lib/types";

type ItemPatch = Partial<
  Pick<
    ItemRecord,
    "title" | "content" | "priority" | "status" | "horizon" | "completedAt"
  >
>;

type ClassificationResult = Pick<
  ItemRecord,
  "itemType" | "status" | "horizon" | "priority"
> &
  Pick<ItemRecord, "project" | "tags">;

type RawRouterResult = {
  mode?: unknown;
  actions?: unknown;
  userFeedback?: unknown;
  user_feedback?: unknown;
};

interface DemoStore {
  items: ItemRecord[];
  sessions: SessionRecord[];
  worklogs: WorklogRecord[];
  schedules: ScheduleRecord[];
  settings: UserSettingsRecord;
  adminVariables: AdminVariableRecord[];
}

let demoStore: DemoStore = {
  items: clone(demoItems),
  sessions: clone(demoSessions),
  worklogs: clone(demoWorklogs),
  schedules: clone(demoSchedules),
  settings: clone(demoSettings),
  adminVariables: clone(demoAdminVariables),
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

function mapScheduleRow(row: Record<string, unknown>): ScheduleRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    notes: String(row.notes ?? ""),
    scheduleDate: String(row.schedule_date ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapSettingsRow(row: Record<string, unknown> | null): UserSettingsRecord {
  return {
    nickname: String(row?.nickname ?? ""),
    worklogExportPath: String(row?.worklog_export_path ?? ""),
    customPrompt: String(row?.custom_prompt ?? ""),
  };
}

function mapAdminVariableRow(row: Record<string, unknown>): AdminVariableRecord {
  return {
    id: String(row.id),
    key: String(row.key ?? ""),
    value: String(row.value ?? ""),
    description: String(row.description ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function supabaseUserId(user: AuthUser | null) {
  if (!isSupabaseConfigured()) {
    return demoUser.id;
  }

  return user?.id ?? null;
}

function promptFor(role: (typeof PROMPT_REGISTRY)[number]["role"]) {
  const prompt = PROMPT_REGISTRY.find((entry) => entry.role === role);
  if (!prompt) {
    throw new Error(`Missing prompt definition: ${role}`);
  }
  return prompt;
}

function classifyTextFallback(text: string): ClassificationResult {
  const trimmed = text.trim();
  if (trimmed.includes("장기") || trimmed.includes("나중")) {
    return {
      itemType: "task",
      status: "todo",
      horizon: "long_term",
      priority: 4,
      project: "",
      tags: [],
    };
  }

  if (trimmed.includes("아이디어") || trimmed.includes("생각")) {
    return {
      itemType: "thought",
      status: "inbox",
      horizon: "soon",
      priority: 3,
      project: "",
      tags: [],
    };
  }

  if (trimmed.includes("메모")) {
    return {
      itemType: "note",
      status: "inbox",
      horizon: "soon",
      priority: 3,
      project: "",
      tags: [],
    };
  }

  return {
    itemType: "task",
    status: "inbox",
    horizon: "now",
    priority: 2,
    project: "",
    tags: [],
  };
}

function isItemType(value: unknown): value is ItemType {
  return ["task", "thought", "journal_seed", "note"].includes(String(value));
}

function isItemStatus(value: unknown): value is ItemStatus {
  return ["inbox", "todo", "doing", "done", "archived"].includes(String(value));
}

function isItemHorizon(value: unknown): value is ItemHorizon {
  return ["now", "soon", "later", "long_term"].includes(String(value));
}

function normalizePriority(value: unknown) {
  const priority = Number(value);
  return Number.isInteger(priority) && priority >= 1 && priority <= 5 ? priority : 3;
}

function personalPromptBlock(settings: UserSettingsRecord) {
  const prompt = settings.customPrompt.trim();
  return prompt ? `[PERSONAL PROMPT]\n${prompt}` : "[PERSONAL PROMPT]\n(none)";
}

async function classifyTextWithGemini(
  text: string,
  settings: UserSettingsRecord,
): Promise<ClassificationResult | null> {
  const response = await generateGeminiJson<Partial<ClassificationResult>>({
    prompt: promptFor("classifier"),
    contents: [personalPromptBlock(settings), "", `[INPUT]\n${text}`].join("\n"),
    maxOutputTokens: 512,
  });

  if (
    !response ||
    !isItemType(response.itemType) ||
    !isItemStatus(response.status) ||
    !isItemHorizon(response.horizon)
  ) {
    return null;
  }

  return {
    itemType: response.itemType,
    status: response.status,
    horizon: response.horizon,
    priority: normalizePriority(response.priority),
    project: typeof response.project === "string" ? response.project : "",
    tags: Array.isArray(response.tags)
      ? response.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

async function classifyText(text: string, user: AuthUser | null) {
  if (!isGeminiConfigured()) {
    return classifyTextFallback(text);
  }

  try {
    const settings = await getUserSettingsFromSupabase(user);
    return (await classifyTextWithGemini(text, settings)) ?? classifyTextFallback(text);
  } catch (_error) {
    return classifyTextFallback(text);
  }
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

async function structureTextWithGemini(
  input: { title: string; rawText: string },
  settings: UserSettingsRecord,
) {
  if (!isGeminiConfigured()) {
    return null;
  }

  try {
    return await generateGeminiText({
      prompt: promptFor("task_structurer"),
      contents: [
        personalPromptBlock(settings),
        "",
        `[TITLE]\n${input.title}`,
        "",
        `[DATE]\n${todayDate()}`,
        "",
        `[BRAIN DUMP]`,
        input.rawText,
      ].join("\n"),
      temperature: 0.2,
      maxOutputTokens: 4096,
    });
  } catch (_error) {
    return null;
  }
}

function isRouterActionType(value: unknown): value is RouterAction["type"] {
  return [
    "create_item",
    "move_selected_item_to_long_term",
    "mark_selected_item_doing",
    "mark_selected_item_done",
    "create_schedule",
    "generate_worklog",
    "save_session",
    "no_op",
  ].includes(String(value));
}

function normalizeRouterResult(raw: RawRouterResult | null): RouterResult | null {
  if (!raw || !Array.isArray(raw.actions)) {
    return null;
  }

  const actions = raw.actions
    .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
    .map((action) => {
      if (!isRouterActionType(action.type)) {
        return null;
      }

      return {
        type: action.type,
        payload:
          action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
            ? (action.payload as Record<string, unknown>)
            : undefined,
      };
    })
    .filter((action): action is RouterAction => Boolean(action));

  if (actions.length === 0) {
    return null;
  }

  const mode =
    raw.mode === "command" || raw.mode === "content_capture" || raw.mode === "hybrid"
      ? raw.mode
      : "command";

  const feedback = raw.userFeedback ?? raw.user_feedback;

  return {
    mode,
    actions,
    userFeedback: typeof feedback === "string" ? feedback : createRouterFeedback(actions),
  };
}

async function routeCommandWithGemini(
  payload: CommandPayload,
  settings: UserSettingsRecord,
) {
  if (!isGeminiConfigured()) {
    return null;
  }

  try {
    const response = await generateGeminiJson<RawRouterResult>({
      prompt: promptFor("command_router"),
      contents: JSON.stringify(
        {
          personal_prompt: settings.customPrompt,
          selected_item_ids: payload.selectedItemIds,
          user_input: payload.text,
        },
        null,
        2,
      ),
      maxOutputTokens: 1024,
    });

    return normalizeRouterResult(response);
  } catch (_error) {
    return null;
  }
}

async function listItemsFromSupabase(user: AuthUser | null) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.items);
  }
  const userId = supabaseUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapItemRow(row));
}

async function listSessionsFromSupabase(user: AuthUser | null) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.sessions);
  }
  const userId = supabaseUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapSessionRow(row));
}

async function listWorklogsFromSupabase(user: AuthUser | null) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.worklogs);
  }
  const userId = supabaseUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("worklogs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapWorklogRow(row));
}

async function listSchedulesFromSupabase(user: AuthUser | null) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.schedules);
  }
  const userId = supabaseUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", userId)
    .order("schedule_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapScheduleRow(row));
}

async function getUserSettingsFromSupabase(user: AuthUser | null) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.settings);
  }
  const userId = supabaseUserId(user);
  if (!userId) return clone(demoSettings);

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapSettingsRow(data);
}

async function listAdminVariablesFromSupabase(user: AuthUser | null) {
  if (!user?.isAdmin) return [];
  const supabase = createServerSupabase();
  if (!supabase) {
    return clone(demoStore.adminVariables);
  }

  const { data, error } = await supabase
    .from("admin_variables")
    .select("*")
    .order("key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapAdminVariableRow(row));
}

export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  if (!isSupabaseConfigured()) {
    return {
      ...demoStatus,
      ai: isGeminiConfigured() ? "Ready" : "Local fallback",
    };
  }

  return {
    backend: "Active",
    ai: isGeminiConfigured() ? "Ready" : "Local fallback",
  };
}

export async function getBootstrapPayload(user: AuthUser | null): Promise<BootstrapPayload> {
  if (isSupabaseConfigured() && !user) {
    return {
      user: null,
      status: await getStatusSnapshot(),
      items: [],
      sessions: [],
      worklogs: [],
      schedules: [],
      settings: clone(demoSettings),
      adminVariables: [],
      prompts: PROMPT_REGISTRY,
      usingSupabase: true,
    };
  }

  try {
    const [status, items, sessions, worklogs, schedules, settings, adminVariables] = await Promise.all([
      getStatusSnapshot(),
      listItemsFromSupabase(user),
      listSessionsFromSupabase(user),
      listWorklogsFromSupabase(user),
      listSchedulesFromSupabase(user),
      getUserSettingsFromSupabase(user),
      listAdminVariablesFromSupabase(user),
    ]);

    return {
      user: user ?? demoUser,
      status,
      items,
      sessions,
      worklogs,
      schedules,
      settings,
      adminVariables,
      prompts: PROMPT_REGISTRY,
      usingSupabase: isSupabaseConfigured(),
    };
  } catch (_error) {
    if (isSupabaseConfigured()) {
      return {
        status: {
          backend: "Error",
          ai: isGeminiConfigured() ? "Ready" : "Local fallback",
          aiError: "Supabase bootstrap failed.",
        },
        user,
        items: [],
        sessions: [],
        worklogs: [],
        schedules: [],
        settings: clone(demoSettings),
        adminVariables: [],
        prompts: PROMPT_REGISTRY,
        usingSupabase: true,
      };
    }

    return {
      status: {
        backend: "Active",
        ai: "Local fallback",
        aiError: "Supabase bootstrap failed. Falling back to demo store.",
      },
      user: user ?? demoUser,
      items: clone(demoStore.items),
      sessions: clone(demoStore.sessions),
      worklogs: clone(demoStore.worklogs),
      schedules: clone(demoStore.schedules),
      settings: clone(demoStore.settings),
      adminVariables: user?.isAdmin ? clone(demoStore.adminVariables) : [],
      prompts: PROMPT_REGISTRY,
      usingSupabase: false,
    };
  }
}

export async function listItems(user: AuthUser | null) {
  return listItemsFromSupabase(user);
}

export async function updateItem(user: AuthUser | null, id: string, patch: ItemPatch) {
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
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

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
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapItemRow(data);
}

export async function deleteItem(user: AuthUser | null, id: string) {
  if (!isSupabaseConfigured()) {
    demoStore.items = demoStore.items.filter((item) => item.id !== id);
    return;
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { error } = await supabase.from("items").delete().eq("id", id).eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createItem(user: AuthUser | null, input: {
  title: string;
  content?: string;
  source?: ItemSource;
  sessionId?: string | null;
}) {
  const classification = await classifyText(input.content || input.title, user);
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
    project: classification.project,
    tags: classification.tags,
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
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: userId,
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

export async function listSessions(user: AuthUser | null) {
  return listSessionsFromSupabase(user);
}

export async function getSessionById(user: AuthUser | null, id: string) {
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
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSessionRow(data);
}

export async function saveSession(user: AuthUser | null, input: {
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
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
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

export async function structureSession(user: AuthUser | null, input: { title: string; rawText: string }) {
  const lines = input.rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const settings = await getUserSettingsFromSupabase(user);
  const geminiStructuredText = await structureTextWithGemini(input, settings);
  const structuredText = geminiStructuredText ?? buildStructuredMarkdown(lines);
  const session = await saveSession(user, {
    title: input.title,
    rawText: input.rawText,
    structuredText,
  });

  const createdItems: ItemRecord[] = [];
  for (const line of lines) {
    createdItems.push(
      await createItem(user, {
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
    usedFallback: !geminiStructuredText,
  };
}

export async function listWorklogs(user: AuthUser | null) {
  return listWorklogsFromSupabase(user);
}

export async function saveWorklog(user: AuthUser | null, input: {
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
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("worklogs")
    .insert({
      user_id: userId,
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

export async function createSchedule(
  user: AuthUser | null,
  input: { title: string; notes?: string; scheduleDate: string },
) {
  const schedule: ScheduleRecord = {
    id: buildId("schedule"),
    title: input.title,
    notes: input.notes ?? "",
    scheduleDate: input.scheduleDate,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };

  if (!isSupabaseConfigured()) {
    demoStore.schedules.unshift(schedule);
    return clone(schedule);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("schedules")
    .insert({
      user_id: userId,
      title: schedule.title,
      notes: schedule.notes,
      schedule_date: schedule.scheduleDate,
      created_at: schedule.createdAt,
      updated_at: schedule.updatedAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapScheduleRow(data);
}

export async function deleteSchedule(user: AuthUser | null, id: string) {
  if (!isSupabaseConfigured()) {
    demoStore.schedules = demoStore.schedules.filter((schedule) => schedule.id !== id);
    return;
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { error } = await supabase.from("schedules").delete().eq("id", id).eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateUserSettings(
  user: AuthUser | null,
  settings: UserSettingsRecord,
) {
  if (!isSupabaseConfigured()) {
    demoStore.settings = clone(settings);
    return clone(demoStore.settings);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("user_settings")
    .upsert({
      user_id: userId,
      nickname: settings.nickname,
      worklog_export_path: settings.worklogExportPath,
      custom_prompt: settings.customPrompt,
      updated_at: isoNow(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSettingsRow(data);
}

export async function upsertAdminVariable(
  user: AuthUser | null,
  input: { id?: string; key: string; value: string; description: string },
) {
  if (!user?.isAdmin) {
    throw new Error("Admin access required");
  }

  if (!isSupabaseConfigured()) {
    const existing = demoStore.adminVariables.find((entry) => entry.id === input.id || entry.key === input.key);
    const next: AdminVariableRecord = {
      id: existing?.id ?? buildId("admin-var"),
      key: input.key,
      value: input.value,
      description: input.description,
      updatedAt: isoNow(),
    };
    demoStore.adminVariables = [next, ...demoStore.adminVariables.filter((entry) => entry.id !== next.id)];
    return clone(next);
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("admin_variables")
    .upsert({
      id: input.id,
      key: input.key,
      value: input.value,
      description: input.description,
      updated_at: isoNow(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapAdminVariableRow(data);
}

async function writeWorklogWithGemini(input: {
  today: string;
  started: ItemRecord[];
  doing: ItemRecord[];
  done: ItemRecord[];
  deferred: ItemRecord[];
  notes: ItemRecord[];
  nextActions: ItemRecord[];
  settings: UserSettingsRecord;
}) {
  if (!isGeminiConfigured()) {
    return null;
  }

  try {
    return await generateGeminiText({
      prompt: promptFor("worklog_writer"),
      contents: JSON.stringify(
        {
          personal_prompt: input.settings.customPrompt,
          preferred_export_path: input.settings.worklogExportPath,
          date: input.today,
          started_tasks: input.started.map((item) => item.title),
          active_doing_tasks: input.doing.map((item) => item.title),
          completed_tasks: input.done.map((item) => item.title),
          deferred_or_long_term: input.deferred.map((item) => item.title),
          thought_fragments: input.notes.map((item) => item.title),
          next_actions: input.nextActions.slice(0, 5).map((item) => item.title),
        },
        null,
        2,
      ),
      temperature: 0.2,
      maxOutputTokens: 4096,
    });
  } catch (_error) {
    return null;
  }
}

export async function generateWorklogDraft(user: AuthUser | null): Promise<WorklogDraftResult> {
  const [items, settings] = await Promise.all([
    listItems(user),
    getUserSettingsFromSupabase(user),
  ]);
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

  const fallbackContentMd = [
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
    "- 수동 fallback 초안입니다. Gemini adapter 연결 전까지는 DB 상태 기반으로만 생성됩니다.",
    "",
    "## 7. ▶️ 다음 액션 (Next Actions)",
    ...(nextActions.length ? nextActions.slice(0, 5).map((item) => `- ${item.title}`) : ["- 다음 액션 없음"]),
  ].join("\n");
  const geminiContentMd = await writeWorklogWithGemini({
    today,
    started,
    doing,
    done,
    deferred,
    notes,
    nextActions,
    settings,
  });

  return {
    title: `업무일지 — ${today}`,
    logDate: today,
    contentMd: geminiContentMd ?? fallbackContentMd,
    contextSummary: {
      started: started.map((item) => item.id),
      doing: doing.map((item) => item.id),
      done: done.map((item) => item.id),
      exportPath: settings.worklogExportPath,
    },
    usedFallback: !geminiContentMd,
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
  if (actions.some((action) => action.type === "create_schedule")) {
    return "일정을 추가했습니다.";
  }
  return "명령을 처리했습니다.";
}

async function applyRouterActions(
  user: AuthUser | null,
  router: RouterResult,
  payload: CommandPayload,
  text: string,
) {
  let draft: WorklogDraftResult | null = null;

  for (const action of router.actions) {
    if (action.type === "move_selected_item_to_long_term") {
      for (const id of payload.selectedItemIds) {
        await updateItem(user, id, {
          status: "todo",
          horizon: "long_term",
          completedAt: null,
        });
      }
    }

    if (action.type === "mark_selected_item_doing") {
      for (const id of payload.selectedItemIds) {
        await updateItem(user, id, {
          status: "doing",
          completedAt: null,
        });
      }
    }

    if (action.type === "mark_selected_item_done") {
      for (const id of payload.selectedItemIds) {
        await updateItem(user, id, {
          status: "done",
          completedAt: isoNow(),
        });
      }
    }

    if (action.type === "generate_worklog") {
      draft = await generateWorklogDraft(user);
    }

    if (action.type === "create_schedule") {
      const title =
        typeof action.payload?.title === "string" && action.payload.title.trim()
          ? action.payload.title.trim()
          : text.slice(0, 80);
      const scheduleDate =
        typeof action.payload?.scheduleDate === "string" && action.payload.scheduleDate.trim()
          ? action.payload.scheduleDate
          : todayDate();
      const notes =
        typeof action.payload?.notes === "string"
          ? action.payload.notes
          : text;

      await createSchedule(user, { title, notes, scheduleDate });
    }

    if (action.type === "create_item") {
      const title =
        typeof action.payload?.title === "string" && action.payload.title.trim()
          ? action.payload.title.trim()
          : text.slice(0, 80);
      const content =
        typeof action.payload?.content === "string" && action.payload.content.trim()
          ? action.payload.content
          : text;

      await createItem(user, {
        title,
        content,
        source: "chat_input",
      });
    }
  }

  return draft;
}

export async function runCommand(user: AuthUser | null, payload: CommandPayload) {
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

  const settings = await getUserSettingsFromSupabase(user);
  const geminiRouter = await routeCommandWithGemini(payload, settings);
  if (geminiRouter) {
    return {
      router: geminiRouter,
      worklogDraft: await applyRouterActions(user, geminiRouter, payload, text),
    };
  }

  if (text.includes("장기") && payload.selectedItemIds.length > 0) {
    actions.push({ type: "move_selected_item_to_long_term" });
    for (const id of payload.selectedItemIds) {
      await updateItem(user, id, {
        status: "todo",
        horizon: "long_term",
        completedAt: null,
      });
    }
  }

  if (text.includes("doing") || text.includes("진행")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_doing" });
      for (const id of payload.selectedItemIds) {
        await updateItem(user, id, {
          status: "doing",
          completedAt: null,
        });
      }
    }
  }

  if (text.includes("완료") || lower.includes("done")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_done" });
      for (const id of payload.selectedItemIds) {
        await updateItem(user, id, {
          status: "done",
          completedAt: isoNow(),
        });
      }
    }
  }

  if (text.includes("업무일지") || lower.includes("work log") || lower.includes("worklog")) {
    actions.push({ type: "generate_worklog" });
    draft = await generateWorklogDraft(user);
  }

  if (text.includes("일정")) {
    actions.push({ type: "create_schedule", payload: { text } });
    await createSchedule(user, {
      title: text.slice(0, 80),
      notes: text,
      scheduleDate: todayDate(),
    });
  }

  if (actions.length === 0) {
    actions.push({
      type: "create_item",
      payload: { text },
    });
    await createItem(user, {
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
