# ScaffoldOrganizer 2.0

기존 바닐라 프로토타입을 `Node.js + React + Next.js + Supabase` 구조로 옮기기 위한 초기 마이그레이션 베이스입니다. 기존 산출물은 [`making/`](./making)에 그대로 남겨두고, 실제 앱 코드는 루트의 Next.js 프로젝트로 분리했습니다.

## 현재 구성

- `app/`: Next.js App Router
- `components/app-shell.tsx`: 기존 `gui_ex.html` 레이아웃을 옮긴 메인 UI
- `app/api/*`: 기존 프론트엔드가 호출하던 백엔드 역할을 대체하는 route handlers
- `lib/repository.ts`: Supabase 저장소와 메모리 fallback을 함께 처리하는 데이터 계층
- `lib/prompts.ts`: `making/api_prompt.md`에서 정리된 Gemini 프롬프트 역할을 코드 레지스트리로 옮긴 파일
- `lib/gemini.ts`: Gemini Developer API 서버 사이드 호출 래퍼
- `supabase/schema.sql`: SQLite 스키마를 Postgres/Supabase 기준으로 변환한 버전

## UI 보존 원칙

다음 구조는 유지했습니다.

- 상단 title + feedback + status strip
- toolbar: `Save / Load / Reset / Export / Work Log`
- tab 구조: `Inbox / Active / Long-term / Schedule / Calendar / Sessions / Work Log / Settings / Admin / Done`
- 메인 패널 안의 item grid
- session split view
- worklog split view
- 하단 sticky command bar

즉, 현재 프로토타입의 화면 구조는 유지하고 구현 기술만 교체하는 방향입니다.

## 실행

1. 의존성 설치

```bash
npm install
```

2. 환경변수 설정

```bash
cp .env.example .env.local
```

필수 키:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `ADMIN_EMAILS`

이 값이 없으면 앱은 깨지지 않고 메모리 기반 demo store로 동작합니다.

3. Supabase schema 적용

`supabase/schema.sql` 내용을 Supabase SQL Editor에서 실행합니다.

4. 개발 서버 실행

```bash
npm run dev
```

## 현재 동작 범위

- 아이템 조회/수정/삭제
- 세션 저장/불러오기
- Gemini 기반 브레인덤프 구조화 및 로컬 fallback
- Gemini 기반 업무일지 draft 생성/저장 및 로컬 fallback
- Gemini 기반 command routing 및 로컬 fallback
- Supabase Auth 기반 회원가입/로그인
- 사용자별 items, sessions, worklogs, schedules, settings 분리
- 사용자 설정 및 관리자 변수 관리
- Supabase 미설정 시 메모리 fallback

## 아직 남아 있는 작업

- Gemini structured output schema 고도화
- 관리자 변수의 세부 권한/감사 로그 강화
- markdown export를 파일 저장 워크플로우와 연결
- prompt registry를 DB `prompt_registry` 테이블과 동기화

## 마이그레이션 메모

- 기존 SQLite의 `tags_json`, `payload_json`, `source_summary_json`은 Supabase에서 `jsonb`로 변경했습니다.
- primary key는 `INTEGER AUTOINCREMENT` 대신 `uuid`로 변경했습니다.
- `updated_at`은 Postgres trigger로 자동 갱신되도록 바꿨습니다.
- 현재 UI의 `Active` 탭은 기존 바닐라 동작과 동일하게 `todo + doing`을 함께 보여줍니다.

## 다음 권장 작업

1. `npm install` 후 로컬에서 타입체크와 실행 확인
2. Supabase 프로젝트 연결
3. Gemini 프롬프트별 출력 schema 강화
4. 관리자 권한 모델 및 export 워크플로우 강화
