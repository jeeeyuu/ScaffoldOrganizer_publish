# ScaffoldOrganizer User Guide

ScaffoldOrganizer는 머릿속에 흩어진 할일, 일정, 현재 상태를 한 번에 적어두고 정리하는 개인용 작업 정리 도구입니다.

## 1. 로그인과 개발 미리보기

실제 사용 환경에서는 로그인해야 앱 기능과 DB 저장을 사용할 수 있습니다.

개발 환경에서 `DEV_PREVIEW_AUTH_BYPASS=true`이면 로그인 없이 demo user 화면을 볼 수 있습니다. 이 demo 데이터는 UI 확인용입니다.

## 2. 기본 화면 구조

상단에는 앱 이름과 주요 버튼이 있습니다.

- `Download`: 현재 item, schedule, worklog를 Markdown으로 다운로드합니다.
- `Settings`: 개인 설정, 보관 목록, 앱 정보, 사용법 페이지로 이동합니다.
- `Admin`: 관리자 계정에서만 보입니다.
- `Logout`: 로그아웃합니다.

메인 탭은 다음과 같습니다.

- `Inbox`: AI가 만든 할일 또는 직접 입력된 항목을 먼저 검토하는 곳입니다.
- `Active`: 지금/곧 처리할 todo와 doing 항목입니다.
- `Long-term`: 장기 보관할 아이디어나 나중 과제입니다.
- `Schedule`: 상태가 없는 날짜별 일정입니다.
- `Calendar`: 일정, doing, done을 날짜별로 보는 대시보드입니다.
- `Work Log`: DB 상태를 기반으로 업무일지 초안을 생성하고 저장합니다.
- `Done`: 완료한 항목입니다.

## 3. Brain Dump 입력

하단 입력창에 자연어로 현재 상황, 상태, 해야 할 일, 걱정, 아이디어를 섞어서 적을 수 있습니다.

예시:

```text
요즘 확인할 자료가 밀려있고 좀 피곤함. 이번 주 회의 전에 문서들을 정리해야 하고,
Supabase 로그인도 확인해야 함. 캘린더 UI도 주말 색이 잘 보이는지 체크해야 함.
```

입력 후 `Send`를 누르면 AI가 다음 순서로 처리합니다.

1. 현재상황, 현재상태, 원래 언급된 할일 후보를 분리합니다.
2. Settings의 personal prompt를 함께 고려합니다.
3. 큰 할일을 실행 가능한 작은 단위로 쪼갭니다.
4. 중요도 priority를 붙입니다.
5. 모든 결과를 `Inbox`에 저장합니다.

AI가 만든 항목은 바로 Active로 가지 않습니다. 사용자가 Inbox에서 확인한 뒤 Active, Long-term, Archive 등을 결정합니다.

## 4. 단순 명령 입력

하단 입력창은 brain dump뿐 아니라 명령도 처리합니다.

예시:

```text
선택한 것 long-term으로 옮겨줘
```

item을 체크한 뒤 위와 같이 입력하면 AI command router가 단순 명령으로 분류하고, 프로그램이 선택 항목을 Long-term으로 이동합니다.

지원되는 대표 명령:

- 선택 항목을 Long-term으로 이동
- 선택 항목을 Doing으로 변경
- 선택 항목을 Done으로 변경
- 일정 추가
- Worklog 생성

## 5. Inbox 사용법

Inbox는 검토 대기함입니다. Brain dump에서 만들어진 모든 할일은 먼저 Inbox로 들어옵니다.

각 카드에서 할 수 있는 일:

- `Active`: 일반 todo로 보냅니다.
- `Doing`: 바로 진행 중으로 표시합니다.
- `Long-term`: 장기 과제로 보냅니다.
- `Done`: 완료 처리합니다.
- `휴지통 아이콘`: Archive로 보냅니다.
- `Edit`: 제목, 내용, priority를 수정합니다.

## 6. Active와 Doing

Active 탭은 `todo + doing` 항목을 함께 보여줍니다.

정렬 기준:

1. Doing 항목이 최상단
2. Priority가 높은 항목이 먼저
3. 같은 조건이면 최근 수정 항목이 먼저

Doing 항목에는 노란색 좌측 강조가 표시됩니다.

`Pause`를 누르면 Doing 항목이 todo 상태로 돌아갑니다.

## 7. Long-term

Long-term은 당장 처리하지 않지만 보존할 과제나 아이디어를 모아두는 곳입니다.

- Inbox/Active 카드의 `Long-term` 버튼으로 이동할 수 있습니다.
- Long-term 카드의 `Active` 버튼을 누르면 다시 일반 active item으로 돌아옵니다.

## 8. Archive와 복원

휴지통 아이콘은 즉시 DB 삭제가 아니라 Archive입니다.

Settings의 `Archived items`에서 보관된 항목을 볼 수 있습니다.

- `Restore`: 다시 Inbox로 복원합니다.
- Archive 후 10일이 지나면 자동 삭제됩니다.

## 9. Schedule

Schedule은 할일과 다른 레이어입니다.

특징:

- todo/doing/done 상태가 없습니다.
- 날짜별로 표시되는 일정입니다.
- Schedule 탭에서 추가/삭제할 수 있습니다.
- 채팅 명령으로도 일정 추가가 가능합니다.

## 10. Calendar

Calendar는 월간 캘린더가 기본입니다.

표시되는 내용:

- 일정은 Google Calendar처럼 pill 형태로 표시됩니다.
- 일정이 3개를 초과하면 `+N more`로 접힙니다.
- 날짜 옆에 doing/done count가 표시됩니다.
- 주말은 색으로 구분됩니다.
- 선택한 날짜부터 7일 일정이 캘린더 아래에 일자별로 표시됩니다.

Settings에서 캘린더 시작 요일을 바꿀 수 있습니다.

- Monday
- Sunday

Doing count는 캘린더와 worklog에서 같은 기준을 씁니다. Doing으로 바뀐 날짜부터 Done 전날까지 카운트하고, 미래 날짜에는 카운트하지 않습니다.

## 11. Work Log

Work Log는 AI API를 호출하지 않습니다. DB에 저장된 내용을 정해진 양식으로 Markdown 초안으로 만듭니다.

`Generate Draft`를 누르면 다음 항목이 포함됩니다.

- 오늘 일정
- 오늘 추가된 작업
- 오늘 진행 중인 작업
- 오늘 완료한 작업
- 보류/장기 전환
- 메모 및 관찰
- 다음 액션

생성된 초안은 큰 textarea에서 수정할 수 있습니다.

- `Save`: worklogs DB에 저장합니다.
- `Download`: 현재 draft를 Markdown 파일로 다운로드합니다.

## 12. Settings

Settings에서 설정할 수 있는 항목:

- `Nickname`: 화면에 표시할 이름입니다.
- `Personal prompt`: brain dump 처리 시 AI에게 같이 전달할 개인 맥락입니다.
- `Calendar week starts on`: 캘린더 시작 요일입니다.
- Backend/AI/Storage 상태 확인
- Archived items 확인 및 복원
- App info 확인
- User Guide 페이지 열기

Personal prompt 예시:

```text
나는 문서 검토, 데이터 정리, 개발 작업을 섞어서 관리한다.
너무 피곤하다고 말하면 첫 행동을 아주 작게 쪼개줘.
출력은 업무/개발 프로젝트 단위로 project를 잘 나눠줘.
```

## 13. Admin

Admin 버튼은 관리자 계정에서만 보입니다.

Admin 페이지에서는 앱에서 사용할 변수들을 관리할 수 있습니다.

- key
- value
- description

## 14. Download

상단 `Download` 버튼은 현재 데이터를 Markdown으로 내보냅니다.

브라우저 보안 정책 때문에 사용자가 지정한 로컬 경로에 직접 저장하지 않고, 일반 다운로드 방식으로 저장됩니다.
