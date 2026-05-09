export type ItemType = "task" | "thought" | "journal_seed" | "note";
export type ItemStatus = "inbox" | "todo" | "doing" | "done" | "archived";
export type ItemHorizon = "now" | "soon" | "later" | "long_term";
export type ItemSource = "chat_input" | "brain_dump" | "manual" | "system";
export type AppTab =
  | "inbox"
  | "active"
  | "longterm"
  | "schedule"
  | "calendar"
  | "worklogs"
  | "settings"
  | "admin"
  | "done";

export interface ItemRecord {
  id: string;
  itemType: ItemType;
  title: string;
  content: string;
  status: ItemStatus;
  horizon: ItemHorizon;
  priority: number;
  source: ItemSource;
  project: string;
  tags: string[];
  scheduledDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sessionId: string | null;
  externalRef: string | null;
}

export interface WorklogRecord {
  id: string;
  logDate: string;
  title: string;
  contentMd: string;
  sourceSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRecord {
  id: string;
  title: string;
  notes: string;
  scheduleDate: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarWeekStartsOn = "monday" | "sunday";

export interface UserSettingsRecord {
  nickname: string;
  worklogExportPath: string;
  customPrompt: string;
  calendarWeekStartsOn: CalendarWeekStartsOn;
}

export interface StatusEventRecord {
  id: string;
  itemId: string | null;
  eventType: string;
  fromStatus: ItemStatus | null;
  toStatus: ItemStatus | null;
  createdAt: string;
}

export interface AdminVariableRecord {
  id: string;
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
  nickname?: string;
  isPreview?: boolean;
  isGuest?: boolean;
  guestExpiresAt?: string;
}

export interface StatusSnapshot {
  backend: "Active" | "Starting" | "Dead" | "Error";
  ai: "Ready" | "Busy" | "Error" | "Local fallback";
  aiError?: string;
}

export interface PromptDefinition {
  role: "classifier" | "brain_dump_processor" | "task_structurer";
  model: string;
  developerMessage: string;
}

export interface BootstrapPayload {
  user: AuthUser | null;
  status: StatusSnapshot;
  items: ItemRecord[];
  worklogs: WorklogRecord[];
  schedules: ScheduleRecord[];
  events: StatusEventRecord[];
  settings: UserSettingsRecord;
  adminVariables: AdminVariableRecord[];
  prompts: PromptDefinition[];
  usingSupabase: boolean;
}

export interface CommandPayload {
  text: string;
  selectedItemIds: string[];
}

export interface WorklogDraftResult {
  title: string;
  logDate: string;
  contentMd: string;
  contextSummary: Record<string, unknown>;
  usedFallback: boolean;
}
