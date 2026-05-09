# Scaffold Organizer User Guide

머릿속에 흩어진 할일, 일정, 현재 상태를 한 번에 적고 정리하는 작업 도구입니다.

## 목차

- [화면 구조](#화면-구조)
- [화면 미리보기](#화면-미리보기)
- [정리되지 않은 입력 보내기](#정리되지-않은-입력-보내기)
- [할일 관리](#할일-관리)
- [일정과 캘린더](#일정과-캘린더)
- [Work Log](#work-log)
- [Settings](#settings)
- [Download](#download)

## 화면 구조

상단 버튼으로 전체 데이터를 다운로드하거나 Settings로 이동할 수 있습니다. 메인 탭은 다음 역할을 합니다.

- `Inbox`: AI가 만든 할일을 먼저 검토하는 곳입니다.
- `Active`: 지금 처리할 todo와 doing 항목입니다.
- `Long-term`: 당장 하지 않지만 보존할 항목입니다.
- `Schedule`: 상태가 없는 날짜별 일정입니다.
- `Calendar`: 일정, doing, done을 날짜별로 보는 화면입니다.
- `Work Log`: 저장된 데이터를 바탕으로 업무일지 초안을 만드는 화면입니다.
- `Done`: 완료한 항목입니다.

## 화면 미리보기

아래 이미지는 사용법 설명을 위한 SVG mock screenshot입니다.

![Login screen](/screenshot/login.svg)

![Active tab](/screenshot/active.svg)

![Calendar page](/screenshot/calendar.svg)

![Settings page](/screenshot/settings.svg)

## 정리되지 않은 입력 보내기

하단 입력창에는 할일만 깔끔하게 적을 필요가 없습니다. 현재 상황, 컨디션, 걱정, 아이디어, 해야 할 일을 말하듯이 섞어서 입력하면 됩니다.

```text
오늘 머리가 복잡하고 집중이 잘 안 됨. 이번 주 안에 문서 정리해야 하고,
회의 전에 일정도 확인해야 함. 작게 쪼개서 처리하고 싶음.
```

AI는 입력을 읽고 현재 상황과 할일 후보를 분리한 뒤, 실행 가능한 작은 단위의 할일로 정리합니다. 만들어진 항목은 모두 `Inbox`로 들어가며, 사용자가 직접 Active로 보낼지 보관할지 결정합니다.

선택한 항목에 대한 간단한 명령도 입력할 수 있습니다. 예를 들어 항목을 체크한 뒤 `선택한 것 long-term으로 옮겨줘`라고 입력하면 해당 항목이 Long-term으로 이동합니다.

## 할일 관리

Inbox는 검토 대기함입니다. 각 카드에서 `Active`, `Doing`, `Long-term`, `Done`, 휴지통, `Edit`을 사용할 수 있습니다.

Active 탭에서는 Doing 항목이 먼저 보이고, 그 다음 priority가 높은 순서로 정렬됩니다. `Pause`를 누르면 Doing 항목이 다시 todo 상태로 돌아갑니다.

Long-term 항목은 나중에 볼 일이나 장기 과제를 모아두는 곳입니다. Long-term 카드의 `Active` 버튼을 누르면 다시 일반 할일로 돌아옵니다.

휴지통 아이콘은 즉시 삭제가 아니라 Archive입니다. Settings의 Archived items에서 복원할 수 있고, 보관 후 10일이 지나면 삭제됩니다.

## 일정과 캘린더

Schedule은 할일과 다른 레이어입니다. todo, doing, done 같은 상태가 없고 날짜별 일정으로만 표시됩니다.

Calendar는 월간 캘린더가 기본입니다. 일정은 pill 형태로 보이고, 일정이 3개를 초과하면 `+N more`로 접힙니다. 날짜 옆에는 doing/done 개수가 표시되고, 주말은 색으로 구분됩니다.

캘린더 아래에는 선택한 날짜부터 7일간의 일정이 일자별로 표시됩니다. 캘린더 시작 요일은 Settings에서 Monday 또는 Sunday로 바꿀 수 있습니다.

## Work Log

Work Log는 AI API를 호출하지 않습니다. DB에 저장된 일정, 오늘 추가한 작업, 진행 중인 작업, 완료한 작업, 장기/보류 항목을 모아 Markdown 초안을 만듭니다.

`Generate Draft`를 누른 뒤 내용을 직접 수정할 수 있습니다. `Save`는 worklogs DB에 저장하고, `Download`는 현재 초안을 Markdown 파일로 내려받습니다.

## Settings

Settings에서는 개인 사용 환경을 조정합니다.

- `Nickname`: Settings 상단 계정 카드와 앱 내부 표시 이름입니다.
- `Personal prompt`: AI가 할일을 쪼갤 때 함께 참고할 개인 맥락입니다.
- `Calendar week starts on`: 캘린더 시작 요일입니다.
- `Archived items`: 보관된 항목을 확인하고 복원합니다.
- `App info`: 앱 상태와 기본 정보를 확인합니다.

Personal prompt에는 자신의 작업 방식이나 원하는 쪼개기 정도를 적으면 됩니다.

```text
컨디션이 안 좋다고 말하면 첫 행동을 아주 작게 쪼개줘.
큰 작업은 30분 안에 시작할 수 있는 단위로 나눠줘.
```

## Download

상단 `Download` 버튼은 현재 item, schedule, worklog를 Markdown으로 내보냅니다. 브라우저 보안 정책 때문에 특정 로컬 경로에 직접 저장하지 않고 일반 다운로드 방식으로 저장됩니다.
