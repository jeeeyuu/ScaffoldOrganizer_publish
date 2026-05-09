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
  | "sessions"
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

export interface SessionRecord {
  id: string;
  title: string;
  rawText: string;
  structuredText: string;
  createdAt: string;
  updatedAt: string;
  exportMdPath: string | null;
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

export interface UserSettingsRecord {
  nickname: string;
  worklogExportPath: string;
  customPrompt: string;
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
}

export interface StatusSnapshot {
  backend: "Active" | "Starting" | "Dead" | "Error";
  ai: "Ready" | "Busy" | "Error" | "Local fallback";
  aiError?: string;
}

export interface PromptDefinition {
  role: "command_router" | "classifier" | "task_structurer" | "worklog_writer";
  model: string;
  developerMessage: string;
}

export interface BootstrapPayload {
  user: AuthUser | null;
  status: StatusSnapshot;
  items: ItemRecord[];
  sessions: SessionRecord[];
  worklogs: WorklogRecord[];
  schedules: ScheduleRecord[];
  settings: UserSettingsRecord;
  adminVariables: AdminVariableRecord[];
  prompts: PromptDefinition[];
  usingSupabase: boolean;
}

export interface RouterAction {
  type:
    | "create_item"
    | "move_selected_item_to_long_term"
    | "mark_selected_item_doing"
    | "mark_selected_item_done"
    | "create_schedule"
    | "generate_worklog"
    | "save_session"
    | "no_op";
  payload?: Record<string, unknown>;
}

export interface RouterResult {
  mode: "command" | "content_capture" | "hybrid";
  actions: RouterAction[];
  userFeedback: string;
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
