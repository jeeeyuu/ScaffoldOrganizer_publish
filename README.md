# ScaffoldOrganizer

ScaffoldOrganizer는 자연어 brain dump를 실행 가능한 할일로 정리하고, 일정/캘린더/worklog까지 한 화면에서 관리하는 개인 생산성 앱입니다. 기존 바닐라 프로토타입을 `Node.js + React + Next.js + Supabase` 구조로 옮긴 프로젝트입니다.

## Tech Stack

- `Next.js App Router`: 화면과 API route 구성
- `React`: 클라이언트 UI
- `Supabase`: Auth, Postgres 저장소, RLS 기반 사용자별 데이터 분리
- `Gemini API`: command routing, brain dump 분해, item classification
- `Demo store`: 개발 환경에서 로그인 없이 GUI를 확인하기 위한 메모리 fallback

## 주요 기능

- Supabase Auth 기반 회원가입/로그인
- 로그인 전 실제 앱 차단, 개발 preview에서는 demo user로 UI 확인
- 사용자별 items, schedules, worklogs, settings 분리
- 자연어 brain dump 입력을 여러 실행 단위 item으로 분해
- 모든 brain dump 결과는 먼저 `Inbox`에 저장
- `Inbox / Active / Long-term / Schedule / Calendar / Work Log / Done` 탭
- `doing` 우선, priority 순서의 할일 카드 정렬
- 할일 상태 전환: Active, Doing, Pause, Done, Archive, Long-term 전환, Long-term에서 Active 복원
- Archive 목록은 Settings에서 확인/복원 가능
- Archive 후 10일 경과 item 자동 삭제
- 일정 추가/삭제 및 캘린더 표시
- 월간 캘린더, 월요일/일요일 시작 설정, 주말 색상 구분
- 캘린더 일자별 일정 pill 표시, 3개 초과 시 `+N more`
- 캘린더 하단 선택일 기준 7일 일정 목록
- Worklog는 LLM 없이 DB 상태를 Markdown 양식으로 생성
- Download 버튼으로 전체 export Markdown 다운로드
- 관리자 계정 전용 Admin variables 페이지
- Settings에서 nickname, personal prompt, calendar week start, app info, user guide 접근

## AI 처리 구조

하단 입력창은 `/api/chat/command`로 전달됩니다.

- `command_router`: 입력이 단순 명령인지 brain dump인지 판단합니다.
- 단순 명령이면 `move_selected_item_to_long_term`, `mark_selected_item_doing`, `mark_selected_item_done`, `create_schedule`, `generate_worklog` 같은 action JSON을 반환하고 프로그램이 즉시 실행합니다.
- brain dump이면 `create_item` 또는 `create_items` 경로를 타고 `brain_dump_processor`가 실행됩니다.
- `brain_dump_processor`: 현재상황, 현재상태, 원래 할일 후보를 먼저 분리한 뒤 personal prompt를 반영해 실행 단위로 쪼개고 priority를 붙입니다.
- 저장 시 모든 brain dump item은 `status: inbox`로 강제됩니다.
- Gemini 실패 또는 미설정 시 줄바꿈/문장 단위 fallback으로 inbox item을 생성합니다.

## Worklog 처리 구조

Worklog는 외부 LLM API를 호출하지 않습니다. `/api/worklogs/generate` route는 DB에 저장된 현재 사용자 데이터를 읽어 Markdown을 조립합니다.

- 오늘 일정: `schedules.scheduleDate === today`
- 오늘 추가된 작업: `items.createdAt === today`
- 오늘 doing: 캘린더와 동일하게 status event 기준으로 doing 시작일부터 done 전날까지
- 오늘 done: 완료일이 오늘인 item
- 보류/장기: `long_term` 또는 `archived`
- notes: `task`가 아닌 item
- next actions: done/archived/long_term이 아닌 item

생성된 draft는 Work Log 페이지에서 수정한 뒤 저장하거나 다운로드할 수 있습니다.

## Supabase Schema

`supabase/schema.sql`은 Postgres/Supabase 기준 스키마입니다. 사용자가 직접 Supabase SQL Editor에서 적용하는 것을 전제로 합니다.

필요한 주요 테이블:

- `items`
- `schedules`
- `worklogs`
- `events`
- `user_settings`
- `admin_variables`
- `prompt_registry`

중요한 컬럼/정책:

- 모든 사용자별 테이블은 `user_id`를 기준으로 RLS owner policy를 사용합니다.
- `events`는 status transition 기록에 사용됩니다.
- `user_settings.calendar_week_starts_on`은 캘린더 시작 요일 설정에 사용됩니다.

## Environment

```bash
cp .env.example .env.local
```

주요 환경변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `DEV_PREVIEW_AUTH_BYPASS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL_COMMAND_ROUTER`
- `GEMINI_MODEL_BRAIN_DUMP_PROCESSOR`
- `GEMINI_MODEL_CLASSIFIER`
- `GEMINI_MODEL_TASK_STRUCTURER`

`DEV_PREVIEW_AUTH_BYPASS=true`이면 개발 서버에서 로그인 없이 demo user로 전체 GUI를 확인할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

기본 개발 서버는 `http://localhost:3000`입니다.

## 사용자 문서

사용자 입장에서의 자세한 사용법은 [USER_GUIDE.md](./USER_GUIDE.md)에 정리되어 있습니다. 앱에서는 `Settings → User Guide` 버튼으로 별도 도움말 페이지에 접근할 수 있습니다.

## 현재 주의사항

- 브라우저 보안 제약 때문에 특정 로컬 경로에 직접 저장하지 않고 다운로드 방식만 사용합니다.
- Google Calendar 연동은 아직 구현되지 않았습니다. 구현 시 OAuth, refresh token 저장, Google event id 동기화 테이블 또는 컬럼 설계가 필요합니다.
- `npm run typecheck`는 환경에 따라 출력 없이 오래 멈출 수 있어, 현재는 TS transpile smoke check를 주로 사용했습니다.
