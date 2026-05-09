import type {
  ItemRecord,
  SessionRecord,
  StatusSnapshot,
  WorklogRecord,
} from "@/lib/types";

const now = "2026-05-08T09:00:00.000Z";

export const demoStatus: StatusSnapshot = {
  backend: "Active",
  telegram: "Idle",
  ai: "Local fallback",
};

export const demoItems: ItemRecord[] = [
  {
    id: "item-1",
    itemType: "task",
    title: "농진청 데이터 컬럼 매핑 정리",
    content: "source 스키마와 앱 내부 item 모델을 매칭합니다.",
    status: "doing",
    horizon: "now",
    priority: 1,
    source: "manual",
    project: "ScaffoldOrganizer",
    tags: ["schema", "mapping"],
    scheduledDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    sessionId: null,
    externalRef: null,
  },
  {
    id: "item-2",
    itemType: "thought",
    title: "long-read RNA foundation model 아이디어",
    content: "장기 리서치 backlog로 유지",
    status: "todo",
    horizon: "long_term",
    priority: 4,
    source: "chat_input",
    project: "Research",
    tags: ["foundation-model"],
    scheduledDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    sessionId: null,
    externalRef: null,
  },
  {
    id: "item-3",
    itemType: "note",
    title: "Telegram polling 구조를 Next route handler와 분리할지 검토",
    content: "cron 또는 edge queue를 붙일지 결정 필요",
    status: "inbox",
    horizon: "soon",
    priority: 3,
    source: "telegram",
    project: "Platform",
    tags: ["telegram"],
    scheduledDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    sessionId: null,
    externalRef: "tg:1024",
  },
  {
    id: "item-4",
    itemType: "task",
    title: "SQLite schema를 Supabase schema로 이전",
    content: "enum, jsonb, uuid 기반으로 재작성",
    status: "done",
    horizon: "now",
    priority: 2,
    source: "system",
    project: "Migration",
    tags: ["supabase"],
    scheduledDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    sessionId: null,
    externalRef: null,
  },
];

export const demoSessions: SessionRecord[] = [
  {
    id: "session-1",
    title: "5월 8일 브레인 덤프",
    rawText: "AI API 계층과 Supabase schema를 함께 정리해야 함",
    structuredText: "## 🍎 브레인덤프 분류 및 구조화\n\n- Supabase schema 마이그레이션\n- AI prompt registry 분리\n",
    createdAt: now,
    updatedAt: now,
    exportMdPath: null,
  },
];

export const demoWorklogs: WorklogRecord[] = [
  {
    id: "worklog-1",
    logDate: "2026-05-08",
    title: "업무일지 — 2026-05-08",
    contentMd: "# 📅 업무일지 — 2026-05-08\n\n## 1. 🟢 오늘 착수한 작업\n- Next.js 마이그레이션 설계 시작\n",
    sourceSummary: {
      started: ["Next.js 마이그레이션 설계 시작"],
    },
    createdAt: now,
    updatedAt: now,
  },
];
