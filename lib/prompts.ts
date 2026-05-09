import type { PromptDefinition } from "@/lib/types";

export const PROMPT_REGISTRY: PromptDefinition[] = [
  {
    role: "command_router",
    model: process.env.OPENAI_MODEL_COMMAND_ROUTER ?? "gpt-5.4-mini",
    developerMessage: `당신은 로컬 생산성 앱의 명령 라우터입니다.
사용자 입력을 해석해 action JSON만 반환합니다.
여러 의도는 여러 action으로 분해합니다.
selected item이 언급되면 반드시 활용합니다.
장기 과제는 long_term, 진행 중은 doing, 업무일지는 generate_worklog로 라우팅합니다.`,
  },
  {
    role: "classifier",
    model: process.env.OPENAI_MODEL_CLASSIFIER ?? "gpt-5.4-mini",
    developerMessage: `짧은 입력을 task, thought, journal_seed, note 중 하나로 분류합니다.
실행 가능하면 task, 아이디어면 thought, 상태 기록이면 journal_seed로 분류합니다.
모호하면 inbox fallback이 가능한 보수적 제안을 합니다.`,
  },
  {
    role: "task_structurer",
    model: process.env.OPENAI_MODEL_TASK_STRUCTURER ?? "gpt-5.4",
    developerMessage: `브레인 덤프를 Markdown으로 구조화합니다.
지금 할 일, 장기 보존, 생각/메모를 나누고 실행 단위를 작게 쪼갭니다.
장기 항목은 절대 제거하지 않습니다.`,
  },
  {
    role: "worklog_writer",
    model: process.env.OPENAI_MODEL_WORKLOG_WRITER ?? "gpt-5.4",
    developerMessage: `업무일지는 한국어 Markdown으로 작성합니다.
doing 상태와 status transition을 반드시 반영합니다.
입력에 없는 결과를 만들지 않고 다음 액션을 실행 가능한 수준으로 적습니다.`,
  },
];
