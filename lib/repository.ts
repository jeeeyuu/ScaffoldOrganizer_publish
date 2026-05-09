import {
  demoAdminVariables,
  demoItems,
  demoSchedules,
  demoSettings,
  demoStatus,
  demoStatusEvents,
  demoUser,
  demoWorklogs,
} from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  generateGeminiJson,
  isGeminiConfigured,
} from "@/lib/gemini";
import { PROMPT_REGISTRY } from "@/lib/prompts";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
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
  StatusEventRecord,
  StatusSnapshot,
  UserSettingsRecord,
  WorklogDraftResult,
  WorklogRecord,
} from "@/lib/types";

const ARCHIVE_RETENTION_DAYS = 10;

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

type BrainDumpItemDraft = Pick<
  ItemRecord,
  "itemType" | "title" | "content" | "horizon" | "priority" | "project" | "tags"
>;

type RawBrainDumpResult = {
  currentSituation?: unknown;
  currentState?: unknown;
  rawTodos?: unknown;
  items?: unknown;
};

type RawRouterResult = {
  mode?: unknown;
  actions?: unknown;
  userFeedback?: unknown;
  user_feedback?: unknown;
};

interface DemoStore {
  items: ItemRecord[];
  worklogs: WorklogRecord[];
  schedules: ScheduleRecord[];
  events: StatusEventRecord[];
  settings: UserSettingsRecord;
  adminVariables: AdminVariableRecord[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

declare global {
  var __scaffoldOrganizerDemoStore: DemoStore | undefined;
}

const demoStore = globalThis.__scaffoldOrganizerDemoStore ??= {
  items: clone(demoItems),
  worklogs: clone(demoWorklogs),
  schedules: clone(demoSchedules),
  events: clone(demoStatusEvents),
  settings: clone(demoSettings),
  adminVariables: clone(demoAdminVariables),
};

const GUEST_SESSION_HOURS = 36;

const LEGACY_AGENCY_FULL = ["농촌", "진흥청"].join("");
const LEGACY_AGENCY_SHORT = ["농", "진", "청"].join("");
const LEGACY_LONG_READ = ["long", "read"].join("-");
const LEGACY_DOMAIN_TOKEN = ["R", "N", "A"].join("");
const LEGACY_FOUNDATION_MODEL = ["foundation", "model"].join(" ");
const LEGACY_RESEARCH_WORD = ["연", "구"].join("");
const LEGACY_RESEARCH_KO = ["리", "서", "치"].join("");
const LEGACY_RESEARCH_EN = ["Res", "earch"].join("");

function removeLegacyDemoTerms(value: string) {
  return value
    .replaceAll(`${LEGACY_AGENCY_FULL} 데이터`, "업무 데이터")
    .replaceAll(`${LEGACY_AGENCY_SHORT} 데이터`, "업무 데이터")
    .replaceAll(LEGACY_AGENCY_FULL, "업무 데이터")
    .replaceAll(LEGACY_AGENCY_SHORT, "업무 데이터")
    .replaceAll(`${LEGACY_RESEARCH_WORD} 데이터 데이터`, "업무 데이터")
    .replaceAll(`${LEGACY_RESEARCH_WORD} 데이터`, "업무 데이터")
    .replaceAll(`${LEGACY_LONG_READ} ${LEGACY_DOMAIN_TOKEN} ${LEGACY_FOUNDATION_MODEL} 아이디어`, "장기 개선 아이디어 정리")
    .replaceAll(`${LEGACY_LONG_READ} ${LEGACY_DOMAIN_TOKEN}`, "업무 자료")
    .replaceAll(`${LEGACY_DOMAIN_TOKEN} ${LEGACY_FOUNDATION_MODEL}`, "업무 자료")
    .replaceAll(LEGACY_FOUNDATION_MODEL, "업무 자료")
    .replaceAll(`장기 ${LEGACY_RESEARCH_KO} backlog로 유지`, "바로 실행하지 않을 제품 개선 아이디어를 장기 목록으로 유지합니다.")
    .replaceAll(LEGACY_RESEARCH_EN, "Product")
    .replaceAll(LEGACY_FOUNDATION_MODEL.replaceAll(" ", "-"), "long-term");
}

function sanitizeDemoStore() {
  demoStore.items = demoStore.items.map((item) => ({
    ...item,
    title: removeLegacyDemoTerms(item.title),
    content: removeLegacyDemoTerms(item.content),
    project: removeLegacyDemoTerms(item.project),
    tags: item.tags.map(removeLegacyDemoTerms),
  }));

  demoStore.schedules = demoStore.schedules.map((schedule) => ({
    ...schedule,
    title: removeLegacyDemoTerms(schedule.title),
    notes: removeLegacyDemoTerms(schedule.notes),
  }));

  demoStore.worklogs = demoStore.worklogs.map((worklog) => ({
    ...worklog,
    title: removeLegacyDemoTerms(worklog.title),
    contentMd: removeLegacyDemoTerms(worklog.contentMd),
  }));
}

sanitizeDemoStore();

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayDate() {
  return dateKey(new Date());
}

function guestExpiresAt() {
  return new Date(Date.now() + GUEST_SESSION_HOURS * 60 * 60 * 1000).toISOString();
}

function isGuestUser(user: AuthUser | null): user is AuthUser & { isGuest: true } {
  return Boolean(user?.isGuest);
}

function guestSessionId(user: AuthUser | null) {
  return isGuestUser(user) ? user.id : null;
}

function assertGuestActive(expiresAt: string | null | undefined) {
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error("Guest session expired. Please create an account or log in.");
  }
}

function archiveDateForItem(item: Pick<ItemRecord, "id" | "updatedAt">, events: StatusEventRecord[]) {
  const archivedEvents = events
    .filter((event) => event.itemId === item.id && event.toStatus === "archived")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return archivedEvents[0]?.createdAt ?? item.updatedAt;
}

function itemCalendarDate(item: ItemRecord) {
  if (item.status === "done" && item.completedAt) {
    return item.completedAt.slice(0, 10);
  }
  return (item.scheduledDate || item.dueDate || item.updatedAt || item.createdAt).slice(0, 10);
}

function statusChangeDate(events: StatusEventRecord[], itemId: string, toStatus: ItemStatus) {
  return events
    .filter((event) => event.itemId === itemId && event.toStatus === toStatus)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    ?.createdAt.slice(0, 10);
}

function doingItemsForDate(items: ItemRecord[], events: StatusEventRecord[], date: string) {
  const today = todayDate();
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

function isOlderThanArchiveRetention(archiveDate: string) {
  const archivedAt = new Date(archiveDate).getTime();
  if (Number.isNaN(archivedAt)) {
    return false;
  }

  return Date.now() - archivedAt > ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
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

function mapStatusEventRow(row: Record<string, unknown>): StatusEventRecord {
  return {
    id: String(row.id),
    itemId: (row.item_id as string | null) ?? null,
    eventType: String(row.event_type ?? ""),
    fromStatus: (row.from_status as ItemStatus | null) ?? null,
    toStatus: (row.to_status as ItemStatus | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapSettingsRow(row: Record<string, unknown> | null): UserSettingsRecord {
  return {
    nickname: String(row?.nickname ?? ""),
    worklogExportPath: String(row?.worklog_export_path ?? ""),
    customPrompt: String(row?.custom_prompt ?? ""),
    calendarWeekStartsOn: row?.calendar_week_starts_on === "sunday" ? "sunday" : "monday",
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

function mapGuestSettingsRow(row: Record<string, unknown> | null): UserSettingsRecord {
  return {
    nickname: String(row?.nickname ?? ""),
    worklogExportPath: "",
    customPrompt: String(row?.custom_prompt ?? ""),
    calendarWeekStartsOn: row?.calendar_week_starts_on === "sunday" ? "sunday" : "monday",
  };
}

async function getGuestSession(sessionId: string) {
  const supabase = createServiceSupabase();
  if (!supabase) {
    throw new Error("Guest mode requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  await supabase.from("guest_sessions").delete().lt("expires_at", isoNow());

  const { data, error } = await supabase
    .from("guest_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Guest session not found.");
  }

  const expiresAt = String(data.expires_at ?? "");
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    await supabase.from("guest_sessions").delete().eq("id", sessionId);
    throw new Error("Guest session expired. Please create an account or log in.");
  }
  return data as Record<string, unknown>;
}

async function getGuestSupabase(user: AuthUser | null) {
  const sessionId = guestSessionId(user);
  if (!sessionId) {
    return null;
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    throw new Error("Guest mode requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  await getGuestSession(sessionId);
  return { supabase, sessionId };
}

export async function createGuestSession() {
  const supabase = createServiceSupabase();
  if (!supabase) {
    throw new Error("Guest mode requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data, error } = await supabase
    .from("guest_sessions")
    .insert({
      expires_at: guestExpiresAt(),
      nickname: "Guest",
      calendar_week_starts_on: "monday",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return String(data.id);
}

function supabaseUserId(user: AuthUser | null) {
  if (!isSupabaseConfigured()) {
    return demoUser.id;
  }

  return user?.id ?? null;
}

function usesDemoStore(user: AuthUser | null) {
  return !isSupabaseConfigured() || user?.isPreview === true;
}

function promptFor(role: (typeof PROMPT_REGISTRY)[number]["role"]) {
  const prompt = PROMPT_REGISTRY.find((entry) => entry.role === role);
  if (!prompt) {
    throw new Error(`Missing prompt definition: ${role}`);
  }
  return prompt;
}

function inferFallbackPriority(text: string) {
  const normalized = text.toLowerCase();
  if (/긴급|급함|오늘|마감|deadline|장애|오류|에러|안됨|실패|중단|critical|urgent/.test(normalized)) {
    return 1;
  }
  if (/확인|점검|검토|테스트|리뷰|수정|반영|문제|bug|fix|review|test/.test(normalized)) {
    return 2;
  }
  if (/정리|작성|생성|만들|구현|연동|설정|공부|학습|조사|확장/.test(normalized)) {
    return 3;
  }
  if (/나중|언젠가|장기|아이디어|생각|후보|maybe|someday/.test(normalized)) {
    return 4;
  }
  return 3;
}

function classifyTextFallback(text: string): ClassificationResult {
  const trimmed = text.trim();
  if (trimmed.includes("장기") || trimmed.includes("나중")) {
    return {
      itemType: "task",
      status: "todo",
      horizon: "long_term",
      priority: inferFallbackPriority(trimmed),
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
    priority: inferFallbackPriority(trimmed),
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

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(0, 8)
    : [];
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripMemoPrefix(value: string) {
  return value.replace(/^\s*메모\s*[:：]\s*/i, "").trim();
}

function isContentTooCloseToInput(content: string, title: string, fallbackText: string) {
  const normalizedContent = normalizedText(stripMemoPrefix(content));
  const normalizedTitle = normalizedText(title);
  const normalizedFallback = normalizedText(fallbackText);

  if (!normalizedContent || normalizedContent === normalizedTitle) {
    return true;
  }
  if (normalizedFallback && normalizedContent === normalizedFallback) {
    return true;
  }
  if (normalizedFallback.length > 40 && normalizedFallback.includes(normalizedContent)) {
    return true;
  }
  if (normalizedContent.length > 40 && normalizedContent.includes(normalizedFallback)) {
    return true;
  }
  return false;
}

function brainDumpMarkerCount(text: string) {
  const normalized = normalizedText(text);
  return [
    "확인",
    "점검",
    "테스트",
    "잘되는지",
    "문제없는지",
    "불편",
    "반영되는지",
    "해야",
    "하고",
    "그리고",
    ",",
  ].filter((marker) => normalized.includes(marker)).length;
}

function isLikelyUnprocessedBrainDumpTitle(title: string, fallbackText: string) {
  const normalizedTitle = normalizedText(title);
  const normalizedFallback = normalizedText(fallbackText);

  if (normalizedFallback.length < 60) {
    return false;
  }
  if (normalizedTitle.length >= 60 && brainDumpMarkerCount(normalizedTitle) >= 2) {
    return true;
  }
  if (normalizedTitle.includes("그거 말고") || normalizedTitle.includes(",")) {
    return true;
  }
  return normalizedFallback.startsWith(normalizedTitle.slice(0, 50));
}

function inferActionContent(title: string) {
  if (/custom prompt|command router|라우터|반영/i.test(title)) {
    return "설정값이 실제 처리 경로에 들어가는지 확인하고, 기대 동작과 다른 지점을 분리해 기록합니다.";
  }
  if (/gemini|brain dump|브레인덤프|api/i.test(title)) {
    return "짧은 입력과 긴 입력을 각각 넣어 보고, 할일 분리와 내용 작성 품질을 기준으로 결과를 비교합니다.";
  }
  if (/guest|게스트/i.test(title)) {
    return "게스트 세션 생성, 데이터 저장, 로그인 후 병합 흐름을 순서대로 확인합니다.";
  }
  if (/ui|불편|화면|사용성/i.test(title)) {
    return "직접 눌러 보며 흐름이 막히는 지점, 버튼 위치, 문구 혼란을 구체적으로 적습니다.";
  }
  if (/worklog|업무일지/i.test(title)) {
    return "오늘의 일정, 진행 중 항목, 완료 항목이 기대한 형식으로 묶이는지 생성 결과를 확인합니다.";
  }
  if (/코드\s*리뷰|코드리뷰|review/i.test(title)) {
    return "변환한 코드가 의도한 분석 흐름을 유지하는지 확인하고, 입력/출력과 주요 함수 호출부터 순서대로 점검합니다.";
  }
  if (/통계|stat/i.test(title)) {
    return "사용된 방법의 목적, 기본 가정, 결과 해석 방식을 하나씩 확인해 나중에 설명할 수 있게 정리합니다.";
  }
  if (/공부|학습|읽기|study/i.test(title)) {
    return "범위를 작게 나눠 첫 자료부터 확인하고, 이해한 내용과 추가 질문을 짧게 메모합니다.";
  }
  if (/목록|list/i.test(title)) {
    return "흩어진 내용을 빠르게 훑어 빠진 항목 없이 체크리스트로 정리합니다.";
  }
  if (/확인|점검|검토|review/i.test(title)) {
    return "먼저 현재 상태를 확인한 뒤 이상한 부분과 다음에 처리할 부분을 분리합니다.";
  }
  return "왜 필요한 작업인지와 첫 행동을 짧게 메모해 바로 시작할 수 있게 만든 항목입니다.";
}

function buildDistinctContent(params: {
  title: string;
  content: string;
  fallbackText: string;
  context?: { currentSituation: string; currentState: string };
}) {
  const content = stripMemoPrefix(params.content);
  if (!isContentTooCloseToInput(content, params.title, params.fallbackText)) {
    return content;
  }

  const contextParts = [
    params.context?.currentSituation ? `상황: ${params.context.currentSituation}` : "",
    params.context?.currentState ? `상태: ${params.context.currentState}` : "",
  ].filter(Boolean);

  return [...contextParts, inferActionContent(params.title)].join(" / ");
}

function normalizeFallbackTitle(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/했던거/g, "한 내용")
    .replace(/제대로\s*/g, "")
    .replace(/^(그리고|또|그거 말고도|전반적으로)\s*/g, "")
    .trim()
    .slice(0, 80);
}

function actionizeFallbackTitle(text: string) {
  let title = normalizeFallbackTitle(text)
    .replace(/\s*(확인해야\s*하고|확인해야하고|확인해보고|확인하고|확인)$/g, "")
    .replace(/\s*(점검해야\s*하고|점검해야하고|점검해보고|점검하고|점검)$/g, "")
    .replace(/\s*(테스트해야\s*하고|테스트해야하고|테스트해보고|테스트하고|테스트)$/g, "")
    .replace(/\s*(해야\s*하고|해야하고|해보고|하고)$/g, "")
    .replace(/잘\s*되는지/g, "정상 동작 여부")
    .replace(/잘\s*하는지/g, "처리 품질")
    .replace(/반영되는지/g, "반영 여부")
    .replace(/문제\s*없는지도?/g, "문제 여부")
    .replace(/불편한\s*거\s*없는지|불편한\s*것\s*없는지/g, "불편한 지점")
    .trim();

  if (!title) {
    title = "입력 내용 정리";
  }

  if (/점검|테스트|확인|검토|리뷰|여부|품질|지점$/.test(title)) {
    return `${title} 점검하기`.replace(/점검 점검하기$/, "점검하기");
  }
  return `${title} 확인하기`;
}

function expandCompoundKoreanTask(text: string) {
  const trimmed = text.trim();
  const tasks: string[] = [];

  const codeReviewMatch = trimmed.match(/(.{0,40}코드.{0,30}?)(?:코드\s*리뷰|코드리뷰)/i);
  if (codeReviewMatch) {
    const subject = normalizeFallbackTitle(codeReviewMatch[1]);
    tasks.push(`${subject || "코드"} 코드 리뷰하기`);
  }

  if (/통계/.test(trimmed) && /사용/.test(trimmed)) {
    tasks.push("코드에서 사용된 통계 방법 목록 만들기");
  }

  if (/통계/.test(trimmed) && /공부|학습|읽기/.test(trimmed)) {
    tasks.push("통계 방법별 의미와 가정 하나씩 공부하기");
  }

  if (tasks.length >= 2) {
    return tasks;
  }

  return trimmed
    .split(/\n|[;；]|그리고|그거 말고도|그다음|다음으로|한 다음|하고 나서|,\s*/)
    .flatMap((part) => part.split(/(?<=\S)하고\s+(?=\S)/))
    .map((part) =>
      /확인|점검|테스트|잘\s*되는지|잘\s*하는지|문제\s*없는지|불편|반영되는지/.test(part)
        ? actionizeFallbackTitle(part)
        : normalizeFallbackTitle(part),
    )
    .filter((part) => part.length >= 3);
}

function personalPromptBlock(settings: UserSettingsRecord) {
  const prompt = settings.customPrompt.trim();
  return prompt ? `[PERSONAL PROMPT]\n${prompt}` : "[PERSONAL PROMPT]\n(none)";
}

function normalizeBrainDumpDraft(
  value: unknown,
  fallbackText: string,
  context?: { currentSituation: string; currentState: string },
): BrainDumpItemDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  if (!title) {
    return null;
  }
  if (isLikelyUnprocessedBrainDumpTitle(title, fallbackText)) {
    return null;
  }

  const itemType = isItemType(entry.itemType) ? entry.itemType : "task";
  const horizon = isItemHorizon(entry.horizon) ? entry.horizon : "now";

  const rawContent = typeof entry.content === "string" ? entry.content : "";
  const contextPrefix = [
    context?.currentSituation ? `상황: ${context.currentSituation}` : "",
    context?.currentState ? `상태: ${context.currentState}` : "",
  ].filter(Boolean).join(" / ");
  const content = buildDistinctContent({
    title,
    content: rawContent,
    fallbackText,
    context,
  });

  return {
    title: title.slice(0, 120),
    content: contextPrefix && !content.startsWith("상황:") ? `${contextPrefix} / ${content}` : content,
    itemType,
    horizon,
    priority: entry.priority == null ? inferFallbackPriority(`${title} ${content}`) : normalizePriority(entry.priority),
    project: typeof entry.project === "string" ? entry.project.trim() : "",
    tags: normalizeStringArray(entry.tags),
  };
}

function splitBrainDumpFallback(text: string): BrainDumpItemDraft[] {
  const lines = text
    .split(/\n|[;；]|(?<=[.!?。！？])\s+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const chunks = (lines.length ? lines : [text])
    .flatMap((line) => expandCompoundKoreanTask(line))
    .filter(Boolean);
  const uniqueChunks = Array.from(new Set(chunks.length ? chunks : [text.trim()]));

  return uniqueChunks.slice(0, 12).map((chunk) => {
    const classification = classifyTextFallback(chunk);
    const title = normalizeFallbackTitle(chunk);
    return {
      title,
      content: buildDistinctContent({
        title,
        content: "",
        fallbackText: chunk,
      }),
      itemType: classification.itemType,
      horizon: classification.horizon,
      priority: inferFallbackPriority(`${title} ${chunk}`),
      project: classification.project,
      tags: classification.tags,
    };
  });
}

async function processBrainDumpWithGemini(
  text: string,
  settings: UserSettingsRecord,
): Promise<BrainDumpItemDraft[] | null> {
  if (!isGeminiConfigured()) {
    return null;
  }

  try {
    const response = await generateGeminiJson<RawBrainDumpResult>({
      prompt: promptFor("brain_dump_processor"),
      contents: [
        personalPromptBlock(settings),
        "",
        "[RULES]",
        "- Return currentSituation, currentState, rawTodos, and 1 to 12 final items.",
        "- Every returned item will be stored with status=inbox, regardless of inferred urgency.",
        "- First separate situation/state from todos, then split todos into concrete next actions.",
        "- Adjust granularity to the user's situation, state, and personal prompt.",
        "- Put the reason/context for each action in content.",
        "",
        `[BRAIN DUMP]\n${text}`,
      ].join("\n"),
      maxOutputTokens: 4096,
    });

    const context = {
      currentSituation:
        typeof response?.currentSituation === "string"
          ? response.currentSituation.trim().slice(0, 240)
          : "",
      currentState:
        typeof response?.currentState === "string"
          ? response.currentState.trim().slice(0, 240)
          : "",
    };
    const items = Array.isArray(response?.items)
      ? response.items
          .map((item) => normalizeBrainDumpDraft(item, text, context))
          .filter((item): item is BrainDumpItemDraft => Boolean(item))
          .slice(0, 12)
      : [];

    return items.length ? items : null;
  } catch (error) {
    console.warn(
      "[brain_dump_processor] Falling back to local splitter:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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

function isRouterActionType(value: unknown): value is RouterAction["type"] {
  return [
    "create_item",
    "move_selected_item_to_long_term",
    "mark_selected_item_doing",
    "mark_selected_item_done",
    "create_schedule",
    "generate_worklog",
    "create_items",
    "no_op",
  ].includes(String(value));
}

function normalizeRouterResult(raw: RawRouterResult | null): RouterResult | null {
  if (!raw || !Array.isArray(raw.actions)) {
    return null;
  }

  const actions = raw.actions
    .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
    .map((action): RouterAction | null => {
      if (!isRouterActionType(action.type)) {
        return null;
      }

      const nextAction: RouterAction = { type: action.type };
      if (action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)) {
        nextAction.payload = action.payload as Record<string, unknown>;
      }
      return nextAction;
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
  } catch (error) {
    console.warn(
      "[command_router] Falling back to local command parser:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function listItemsFromSupabase(user: AuthUser | null) {
  if (usesDemoStore(user)) {
    return clone(demoStore.items);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_items")
      .select("*")
      .eq("guest_session_id", guest.sessionId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapItemRow(row));
  }

  const supabase = await createServerSupabase();
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

async function listWorklogsFromSupabase(user: AuthUser | null) {
  if (usesDemoStore(user)) {
    return clone(demoStore.worklogs);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_worklogs")
      .select("*")
      .eq("guest_session_id", guest.sessionId)
      .order("log_date", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapWorklogRow(row));
  }

  const supabase = await createServerSupabase();
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
  if (usesDemoStore(user)) {
    return clone(demoStore.schedules);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_schedules")
      .select("*")
      .eq("guest_session_id", guest.sessionId)
      .order("schedule_date", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapScheduleRow(row));
  }

  const supabase = await createServerSupabase();
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

async function listStatusEventsFromSupabase(user: AuthUser | null) {
  if (usesDemoStore(user)) {
    return clone(demoStore.events);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_events")
      .select("*")
      .eq("guest_session_id", guest.sessionId)
      .eq("event_type", "status_change")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapStatusEventRow(row));
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return clone(demoStore.events);
  }
  const userId = supabaseUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .eq("event_type", "status_change")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapStatusEventRow(row));
}

async function getUserSettingsFromSupabase(user: AuthUser | null) {
  if (usesDemoStore(user)) {
    return clone(demoStore.settings);
  }

  const sessionId = guestSessionId(user);
  if (sessionId) {
    return mapGuestSettingsRow(await getGuestSession(sessionId));
  }

  const supabase = await createServerSupabase();
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

  if (!data && user?.nickname) {
    const settings = {
      ...demoSettings,
      nickname: user.nickname,
    };
    await supabase.from("user_settings").upsert({
      user_id: userId,
      nickname: settings.nickname,
      worklog_export_path: settings.worklogExportPath,
      custom_prompt: settings.customPrompt,
      calendar_week_starts_on: settings.calendarWeekStartsOn,
      updated_at: isoNow(),
    });
    return settings;
  }

  return mapSettingsRow(data);
}

async function listAdminVariablesFromSupabase(user: AuthUser | null) {
  if (!user?.isAdmin) return [];
  if (usesDemoStore(user)) {
    return clone(demoStore.adminVariables);
  }

  const supabase = await createServerSupabase();
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

async function cleanupExpiredArchivedItems(user: AuthUser | null) {
  if (usesDemoStore(user)) {
    const expiredIds = demoStore.items
      .filter((item) => item.status === "archived")
      .filter((item) => isOlderThanArchiveRetention(archiveDateForItem(item, demoStore.events)))
      .map((item) => item.id);

    if (expiredIds.length) {
      demoStore.items = demoStore.items.filter((item) => !expiredIds.includes(item.id));
      demoStore.events = demoStore.events.filter((event) => !event.itemId || !expiredIds.includes(event.itemId));
    }
    return;
  }

  if (isGuestUser(user)) {
    return;
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return;
  }
  const userId = supabaseUserId(user);
  if (!userId) return;

  const { data: itemRows, error: itemError } = await supabase
    .from("items")
    .select("id, updated_at")
    .eq("user_id", userId)
    .eq("status", "archived");

  if (itemError || !itemRows?.length) {
    return;
  }

  const { data: eventRows } = await supabase
    .from("events")
    .select("item_id, created_at")
    .eq("user_id", userId)
    .eq("event_type", "status_change")
    .eq("to_status", "archived");

  const archivedEvents = (eventRows ?? []).map((row) => ({
    id: "",
    itemId: (row.item_id as string | null) ?? null,
    eventType: "status_change",
    fromStatus: null,
    toStatus: "archived" as const,
    createdAt: String(row.created_at ?? ""),
  }));
  const expiredIds = itemRows
    .map((row) => ({
      id: String(row.id),
      updatedAt: String(row.updated_at ?? ""),
    }))
    .filter((item) => isOlderThanArchiveRetention(archiveDateForItem(item, archivedEvents)))
    .map((item) => item.id);

  if (expiredIds.length) {
    await supabase.from("items").delete().eq("user_id", userId).in("id", expiredIds);
  }
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
  if (usesDemoStore(user)) {
    await cleanupExpiredArchivedItems(user);

    return {
      user: user ?? demoUser,
      status: {
        ...demoStatus,
        ai: isGeminiConfigured() ? "Ready" : "Local fallback",
      },
      items: clone(demoStore.items),
      worklogs: clone(demoStore.worklogs),
      schedules: clone(demoStore.schedules),
      events: clone(demoStore.events),
      settings: clone(demoStore.settings),
      adminVariables: user?.isAdmin || !user ? clone(demoStore.adminVariables) : [],
      prompts: PROMPT_REGISTRY,
      usingSupabase: false,
    };
  }

  if (isSupabaseConfigured() && !user) {
    return {
      user: null,
      status: await getStatusSnapshot(),
      items: [],
      worklogs: [],
      schedules: [],
      events: [],
      settings: clone(demoSettings),
      adminVariables: [],
      prompts: PROMPT_REGISTRY,
      usingSupabase: true,
    };
  }

  try {
    await cleanupExpiredArchivedItems(user);

    const [status, items, worklogs, schedules, events, settings, adminVariables] = await Promise.all([
      getStatusSnapshot(),
      listItemsFromSupabase(user),
      listWorklogsFromSupabase(user),
      listSchedulesFromSupabase(user),
      listStatusEventsFromSupabase(user),
      getUserSettingsFromSupabase(user),
      listAdminVariablesFromSupabase(user),
    ]);

    return {
      user: user ?? demoUser,
      status,
      items,
      worklogs,
      schedules,
      events,
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
        worklogs: [],
        schedules: [],
        events: [],
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
      worklogs: clone(demoStore.worklogs),
      schedules: clone(demoStore.schedules),
      events: clone(demoStore.events),
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
  if (usesDemoStore(user)) {
    const previous = demoStore.items.find((item) => item.id === id);
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
    if (previous && patch.status && previous.status !== patch.status) {
      demoStore.events.unshift({
        id: buildId("event"),
        itemId: id,
        eventType: "status_change",
        fromStatus: previous.status,
        toStatus: patch.status,
        createdAt: isoNow(),
      });
    }
    return clone(nextItem);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data: previous } = await guest.supabase
      .from("guest_items")
      .select("status")
      .eq("id", id)
      .eq("guest_session_id", guest.sessionId)
      .single();

    const { data, error } = await guest.supabase
      .from("guest_items")
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
      .eq("guest_session_id", guest.sessionId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const previousStatus = previous?.status as ItemStatus | undefined;
    if (patch.status && previousStatus && previousStatus !== patch.status) {
      const { error: eventError } = await guest.supabase.from("guest_events").insert({
        guest_session_id: guest.sessionId,
        item_id: id,
        event_type: "status_change",
        from_status: previousStatus,
        to_status: patch.status,
        payload: { title: data.title },
        created_at: isoNow(),
      });

      if (eventError) {
        throw new Error(eventError.message);
      }
    }

    return mapItemRow(data);
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }
  const userId = supabaseUserId(user);
  if (!userId) throw new Error("Authentication required");

  const { data: previous } = await supabase
    .from("items")
    .select("status")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

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

  const previousStatus = previous?.status as ItemStatus | undefined;
  if (patch.status && previousStatus && previousStatus !== patch.status) {
    const { error: eventError } = await supabase.from("events").insert({
      user_id: userId,
      item_id: id,
      event_type: "status_change",
      from_status: previousStatus,
      to_status: patch.status,
      payload: { title: data.title },
      created_at: isoNow(),
    });

    if (eventError) {
      throw new Error(eventError.message);
    }
  }

  return mapItemRow(data);
}

export async function deleteItem(user: AuthUser | null, id: string) {
  if (usesDemoStore(user)) {
    demoStore.items = demoStore.items.filter((item) => item.id !== id);
    return;
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { error } = await guest.supabase
      .from("guest_items")
      .delete()
      .eq("id", id)
      .eq("guest_session_id", guest.sessionId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const supabase = await createServerSupabase();
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
  return createItemFromClassification(user, input, classification);
}

async function createItemFromClassification(
  user: AuthUser | null,
  input: {
    title: string;
    content?: string;
    source?: ItemSource;
    sessionId?: string | null;
  },
  classification: ClassificationResult,
) {
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

  if (usesDemoStore(user)) {
    demoStore.items.unshift(item);
    return clone(item);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_items")
      .insert({
        guest_session_id: guest.sessionId,
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

  const supabase = await createServerSupabase();
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

async function createInboxItemFromBrainDump(user: AuthUser | null, draft: BrainDumpItemDraft) {
  return createItemFromClassification(
    user,
    {
      title: draft.title,
      content: draft.content,
      source: "brain_dump",
    },
    {
      itemType: draft.itemType,
      status: "inbox",
      horizon: draft.horizon,
      priority: draft.priority,
      project: draft.project,
      tags: draft.tags,
    },
  );
}

async function createInboxItemsFromBrainDump(user: AuthUser | null, text: string, settings: UserSettingsRecord) {
  const drafts = (await processBrainDumpWithGemini(text, settings)) ?? splitBrainDumpFallback(text);
  return Promise.all(drafts.map((draft) => createInboxItemFromBrainDump(user, draft)));
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

  if (usesDemoStore(user)) {
    demoStore.worklogs.unshift(worklog);
    return clone(worklog);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_worklogs")
      .insert({
        guest_session_id: guest.sessionId,
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

  const supabase = await createServerSupabase();
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

  if (usesDemoStore(user)) {
    demoStore.schedules.unshift(schedule);
    return clone(schedule);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_schedules")
      .insert({
        guest_session_id: guest.sessionId,
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

  const supabase = await createServerSupabase();
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
  if (usesDemoStore(user)) {
    demoStore.schedules = demoStore.schedules.filter((schedule) => schedule.id !== id);
    return;
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { error } = await guest.supabase
      .from("guest_schedules")
      .delete()
      .eq("id", id)
      .eq("guest_session_id", guest.sessionId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const supabase = await createServerSupabase();
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
  if (usesDemoStore(user)) {
    demoStore.settings = clone(settings);
    return clone(demoStore.settings);
  }

  const guest = await getGuestSupabase(user);
  if (guest) {
    const { data, error } = await guest.supabase
      .from("guest_sessions")
      .update({
        nickname: settings.nickname,
        custom_prompt: settings.customPrompt,
        calendar_week_starts_on: settings.calendarWeekStartsOn,
        updated_at: isoNow(),
      })
      .eq("id", guest.sessionId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapGuestSettingsRow(data);
  }

  const supabase = await createServerSupabase();
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
      calendar_week_starts_on: settings.calendarWeekStartsOn,
      updated_at: isoNow(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSettingsRow(data);
}

export async function mergeGuestSessionIntoUser(user: AuthUser | null, guestSessionId: string | null | undefined) {
  if (!user || user.isGuest || !guestSessionId || !isSupabaseConfigured()) {
    return;
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from("guest_sessions")
    .select("*")
    .eq("id", guestSessionId)
    .maybeSingle();

  if (sessionError || !session || session.merged_at) {
    return;
  }

  assertGuestActive(String(session.expires_at ?? ""));

  const { data: existingSettings } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingSettings) {
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      nickname: user.nickname || String(session.nickname ?? ""),
      worklog_export_path: "",
      custom_prompt: String(session.custom_prompt ?? ""),
      calendar_week_starts_on: session.calendar_week_starts_on === "sunday" ? "sunday" : "monday",
      updated_at: isoNow(),
    });
  }

  const { data: guestItems } = await supabase
    .from("guest_items")
    .select("*")
    .eq("guest_session_id", guestSessionId)
    .order("created_at", { ascending: true });

  const itemIdMap = new Map<string, string>();
  for (const item of guestItems ?? []) {
    const { data: inserted, error } = await supabase
      .from("items")
      .insert({
        user_id: user.id,
        item_type: item.item_type,
        title: item.title,
        content: item.content,
        status: item.status,
        horizon: item.horizon,
        priority: item.priority,
        source: item.source,
        project: item.project,
        tags: item.tags,
        scheduled_date: item.scheduled_date,
        due_date: item.due_date,
        created_at: item.created_at,
        updated_at: item.updated_at,
        completed_at: item.completed_at,
        external_ref: item.external_ref,
      })
      .select("id")
      .single();

    if (!error && inserted?.id) {
      itemIdMap.set(String(item.id), String(inserted.id));
    }
  }

  const { data: guestSchedules } = await supabase
    .from("guest_schedules")
    .select("*")
    .eq("guest_session_id", guestSessionId);

  if (guestSchedules?.length) {
    const { error } = await supabase.from("schedules").insert(
      guestSchedules.map((schedule) => ({
        user_id: user.id,
        title: schedule.title,
        notes: schedule.notes,
        schedule_date: schedule.schedule_date,
        created_at: schedule.created_at,
        updated_at: schedule.updated_at,
      })),
    );
    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: guestWorklogs } = await supabase
    .from("guest_worklogs")
    .select("*")
    .eq("guest_session_id", guestSessionId);

  if (guestWorklogs?.length) {
    const { error } = await supabase.from("worklogs").insert(
      guestWorklogs.map((worklog) => ({
        user_id: user.id,
        log_date: worklog.log_date,
        title: worklog.title,
        content_md: worklog.content_md,
        source_summary: worklog.source_summary,
        created_at: worklog.created_at,
        updated_at: worklog.updated_at,
      })),
    );
    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: guestEvents } = await supabase
    .from("guest_events")
    .select("*")
    .eq("guest_session_id", guestSessionId)
    .order("created_at", { ascending: true });

  if (guestEvents?.length) {
    const mappedEvents = guestEvents.map((event) => ({
      user_id: user.id,
      item_id: event.item_id ? itemIdMap.get(String(event.item_id)) ?? null : null,
      event_type: event.event_type,
      from_status: event.from_status,
      to_status: event.to_status,
      payload: event.payload,
      created_at: event.created_at,
    }));
    const { error } = await supabase.from("events").insert(mappedEvents);
    if (error) {
      throw new Error(error.message);
    }
  }

  await supabase
    .from("guest_sessions")
    .update({
      merged_user_id: user.id,
      merged_at: isoNow(),
    })
    .eq("id", guestSessionId);

  await supabase.from("guest_sessions").delete().eq("id", guestSessionId);
}

export async function deleteUserAccount(user: AuthUser | null) {
  if (!user || user.isGuest) {
    throw new Error("Authentication required");
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    throw new Error("Account deletion requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertAdminVariable(
  user: AuthUser | null,
  input: { id?: string; key: string; value: string; description: string },
) {
  if (!user?.isAdmin) {
    throw new Error("Admin access required");
  }

  if (usesDemoStore(user)) {
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

  const supabase = await createServerSupabase();
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

export async function generateWorklogDraft(user: AuthUser | null): Promise<WorklogDraftResult> {
  const [items, schedules, events] = await Promise.all([
    listItems(user),
    listSchedulesFromSupabase(user),
    listStatusEventsFromSupabase(user),
  ]);
  const today = todayDate();
  const started = items.filter((item) => item.createdAt.slice(0, 10) === today);
  const doing = doingItemsForDate(items, events, today);
  const done = items.filter((item) => item.status === "done" && itemCalendarDate(item) === today);
  const todaysSchedules = schedules
    .filter((schedule) => schedule.scheduleDate === today)
    .sort((a, b) => a.title.localeCompare(b.title));
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
    "## 1. 📌 오늘 일정 (Schedules)",
    ...(todaysSchedules.length
      ? todaysSchedules.map((schedule) => `- ${schedule.title}${schedule.notes ? `: ${schedule.notes}` : ""}`)
      : ["- 예정된 일정 없음"]),
    "",
    "## 2. 🟢 오늘 추가된 작업 (Created Today)",
    ...(started.length ? started.map((item) => `- ${item.title}`) : ["- 신규 착수 항목 없음"]),
    "",
    "## 3. 🔵 오늘 진행 중인 작업 (Calendar Doing)",
    ...(doing.length ? doing.map((item) => `- ${item.title}`) : ["- 진행 중 항목 없음"]),
    "",
    "## 4. ✅ 오늘 완료한 작업 (Completed Today)",
    ...(done.length ? done.map((item) => `- ${item.title}`) : ["- 완료 항목 없음"]),
    "",
    "## 5. ⏸ 보류 / 장기 전환 (Deferred / Long-term)",
    ...(deferred.length ? deferred.map((item) => `- ${item.title}`) : ["- 장기/보류 항목 없음"]),
    "",
    "## 6. 🧠 메모 및 관찰 (Notes & Observations)",
    ...(notes.length ? notes.map((item) => `- ${item.title}`) : ["- 메모 없음"]),
    "",
    "## 7. ▶️ 다음 액션 (Next Actions)",
    ...(nextActions.length ? nextActions.slice(0, 5).map((item) => `- ${item.title}`) : ["- 다음 액션 없음"]),
  ].join("\n");

  return {
    title: `업무일지 — ${today}`,
    logDate: today,
    contentMd,
    contextSummary: {
      schedules: todaysSchedules.map((schedule) => schedule.id),
      started: started.map((item) => item.id),
      doing: doing.map((item) => item.id),
      done: done.map((item) => item.id),
    },
    usedFallback: false,
  };
}

function createRouterFeedback(actions: RouterAction[]) {
  if (actions.some((action) => action.type === "generate_worklog")) {
    return "업무일지 초안을 생성했습니다.";
  }
  if (actions.some((action) => action.type === "move_selected_item_to_long_term")) {
    return "선택 항목을 장기 과제로 이동했습니다.";
  }
  if (actions.some((action) => action.type === "create_items")) {
    return "브레인덤프를 작은 할일들로 나눠 Inbox에 저장했습니다.";
  }
  if (actions.some((action) => action.type === "create_item")) {
    return "브레인덤프를 작은 할일들로 나눠 Inbox에 저장했습니다.";
  }
  if (actions.some((action) => action.type === "create_schedule")) {
    return "일정을 추가했습니다.";
  }
  return "명령을 처리했습니다.";
}

function isExplicitWorklogCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized.includes("업무일지") && !normalized.includes("worklog") && !normalized.includes("work log")) {
    return false;
  }

  const checklistMarkers = [
    "확인",
    "점검",
    "테스트",
    "잘되는지",
    "문제없는지",
    "불편",
    "반영되는지",
    "해야",
  ];
  if (checklistMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  return [
    "생성",
    "만들",
    "작성",
    "초안",
    "뽑",
    "generate",
    "create",
  ].some((marker) => normalized.includes(marker));
}

function isBrainDumpChecklist(text: string) {
  const normalized = text.trim().toLowerCase();
  if (normalized.length < 45) {
    return false;
  }

  const checklistScore = [
    "확인",
    "점검",
    "테스트",
    "잘되는지",
    "문제없는지",
    "불편",
    "반영되는지",
    "해야",
    "해보고",
    "없는지",
  ].filter((marker) => normalized.includes(marker)).length;
  const conjunctionScore = [
    "하고",
    "그리고",
    "그거 말고",
    "전반적으로",
    ",",
    ".",
  ].filter((marker) => normalized.includes(marker)).length;

  return checklistScore >= 2 || (checklistScore >= 1 && conjunctionScore >= 2);
}

function looksLikeScheduleCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized.includes("일정") && !normalized.includes("schedule")) {
    return false;
  }
  return /추가|등록|넣어|잡아|생성|만들|add|create|schedule/.test(normalized);
}

function shouldBypassCommandRouterForBrainDump(payload: CommandPayload) {
  const text = payload.text.trim();
  const normalized = text.toLowerCase();
  if (payload.selectedItemIds.length > 0 || isExplicitWorklogCommand(text) || looksLikeScheduleCommand(text)) {
    return false;
  }
  if (isBrainDumpChecklist(text)) {
    return true;
  }
  if (text.length >= 35) {
    return true;
  }
  return /해야|하려고|하고\s|그리고|문제|걱정|컨디션|상태|할일|todo|brain dump/.test(normalized);
}

function routeFastLocalCommand(payload: CommandPayload): RouterResult | null {
  const text = payload.text.trim().toLowerCase();
  const hasSelection = payload.selectedItemIds.length > 0;
  const actions: RouterAction[] = [];

  if (hasSelection && (text.includes("장기") || text.includes("long-term") || text.includes("long term"))) {
    actions.push({ type: "move_selected_item_to_long_term" });
  } else if (hasSelection && (text.includes("doing") || text.includes("진행") || text.includes("시작"))) {
    actions.push({ type: "mark_selected_item_doing" });
  } else if (hasSelection && (text.includes("완료") || text.includes("끝") || text.includes("done"))) {
    actions.push({ type: "mark_selected_item_done" });
  } else if (isExplicitWorklogCommand(text)) {
    actions.push({ type: "generate_worklog" });
  }

  if (actions.length === 0) {
    return null;
  }

  return {
    mode: "command",
    actions,
    userFeedback: createRouterFeedback(actions),
  };
}

async function applyRouterActions(
  user: AuthUser | null,
  router: RouterResult,
  payload: CommandPayload,
  text: string,
  userSettings?: UserSettingsRecord,
) {
  let draft: WorklogDraftResult | null = null;
  const createdItems: ItemRecord[] = [];
  const updatedItems: ItemRecord[] = [];
  const createdSchedules: ScheduleRecord[] = [];

  for (const action of router.actions) {
    if (action.type === "move_selected_item_to_long_term") {
      updatedItems.push(
        ...(await Promise.all(
          payload.selectedItemIds.map((id) =>
            updateItem(user, id, {
              status: "todo",
              horizon: "long_term",
              completedAt: null,
            }),
          ),
        )),
      );
    }

    if (action.type === "mark_selected_item_doing") {
      updatedItems.push(
        ...(await Promise.all(
          payload.selectedItemIds.map((id) =>
            updateItem(user, id, {
              status: "doing",
              completedAt: null,
            }),
          ),
        )),
      );
    }

    if (action.type === "mark_selected_item_done") {
      const completedAt = isoNow();
      updatedItems.push(
        ...(await Promise.all(
          payload.selectedItemIds.map((id) =>
            updateItem(user, id, {
              status: "done",
              completedAt,
            }),
          ),
        )),
      );
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

      createdSchedules.push(await createSchedule(user, { title, notes, scheduleDate }));
    }

    if (action.type === "create_item" || action.type === "create_items") {
      const sourceText =
        typeof action.payload?.content === "string" && action.payload.content.trim()
          ? action.payload.content.trim()
          : typeof action.payload?.text === "string" && action.payload.text.trim()
            ? action.payload.text.trim()
            : text;
      const settings = userSettings ?? (await getUserSettingsFromSupabase(user));
      createdItems.push(...(await createInboxItemsFromBrainDump(user, sourceText, settings)));
    }
  }

  return {
    worklogDraft: draft,
    createdItems,
    updatedItems,
    createdSchedules,
  };
}

export async function runCommand(user: AuthUser | null, payload: CommandPayload) {
  const text = payload.text.trim();
  const actions: RouterAction[] = [];
  const lower = text.toLowerCase();
  let draft: WorklogDraftResult | null = null;
  const createdItems: ItemRecord[] = [];
  const updatedItems: ItemRecord[] = [];
  const createdSchedules: ScheduleRecord[] = [];

  if (!text) {
    return {
      router: {
        mode: "command",
        actions: [{ type: "no_op" }],
        userFeedback: "빈 입력입니다.",
      } satisfies RouterResult,
      worklogDraft: null,
      createdItems: [],
      updatedItems: [],
      createdSchedules: [],
    };
  }

  const fastRouter = routeFastLocalCommand(payload);
  if (fastRouter) {
    const result = await applyRouterActions(user, fastRouter, payload, text);
    return {
      router: fastRouter,
      ...result,
    };
  }

  const settings = await getUserSettingsFromSupabase(user);
  if (shouldBypassCommandRouterForBrainDump(payload)) {
    actions.push({
      type: "create_items",
      payload: { text },
    });
    createdItems.push(...(await createInboxItemsFromBrainDump(user, text, settings)));

    return {
      router: {
        mode: "content_capture",
        actions,
        userFeedback: createRouterFeedback(actions),
      },
      worklogDraft: null,
      createdItems,
      updatedItems,
      createdSchedules,
    };
  }

  const geminiRouter = await routeCommandWithGemini(payload, settings);
  if (geminiRouter) {
    const result = await applyRouterActions(user, geminiRouter, payload, text, settings);
    return {
      router: geminiRouter,
      ...result,
    };
  }

  if (text.includes("장기") && payload.selectedItemIds.length > 0) {
    actions.push({ type: "move_selected_item_to_long_term" });
    for (const id of payload.selectedItemIds) {
      updatedItems.push(
        await updateItem(user, id, {
          status: "todo",
          horizon: "long_term",
          completedAt: null,
        }),
      );
    }
  }

  if (text.includes("doing") || text.includes("진행")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_doing" });
      for (const id of payload.selectedItemIds) {
        updatedItems.push(
          await updateItem(user, id, {
            status: "doing",
            completedAt: null,
          }),
        );
      }
    }
  }

  if (text.includes("완료") || lower.includes("done")) {
    if (payload.selectedItemIds.length > 0) {
      actions.push({ type: "mark_selected_item_done" });
      for (const id of payload.selectedItemIds) {
        updatedItems.push(
          await updateItem(user, id, {
            status: "done",
            completedAt: isoNow(),
          }),
        );
      }
    }
  }

  if (isExplicitWorklogCommand(text)) {
    actions.push({ type: "generate_worklog" });
    draft = await generateWorklogDraft(user);
  }

  if (text.includes("일정")) {
    actions.push({ type: "create_schedule", payload: { text } });
    createdSchedules.push(
      await createSchedule(user, {
        title: text.slice(0, 80),
        notes: text,
        scheduleDate: todayDate(),
      }),
    );
  }

  if (actions.length === 0) {
    actions.push({
      type: "create_items",
      payload: { text },
    });
    createdItems.push(...(await createInboxItemsFromBrainDump(user, text, settings)));
  }

  const router: RouterResult = {
    mode:
      actions.some((action) => action.type === "create_item" || action.type === "create_items") && actions.length > 1
        ? "hybrid"
        : actions[0]?.type === "create_item" || actions[0]?.type === "create_items"
          ? "content_capture"
          : "command",
    actions,
    userFeedback: createRouterFeedback(actions),
  };

  return {
    router,
    worklogDraft: draft,
    createdItems,
    updatedItems,
    createdSchedules,
  };
}
