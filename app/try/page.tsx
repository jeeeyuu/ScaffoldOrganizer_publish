import Link from "next/link";

export default function TryPage() {
  return (
    <main className="guest-start-shell">
      <section className="guest-start-card">
        <p className="eyebrow">Guest mode</p>
        <h1>로그인 없이 Scaffold Organizer를 체험합니다.</h1>
        <p>
          이 기능은 <strong>36시간만 지속</strong>됩니다. 36시간 이내 회원가입을 하지 않을 경우
          게스트로 만든 모든 데이터는 삭제될 수 있습니다.
        </p>
        <p className="meta">
          체험 중 만든 할일, 일정, 설정, worklog는 로그인 또는 회원가입 후 자동으로 계정에 병합됩니다.
        </p>
        <div className="guest-actions">
          <form action="/api/guest/start" method="post">
            <button type="submit">그래도 게스트로 시작</button>
          </form>
          <Link href="/">로그인으로 돌아가기</Link>
        </div>
      </section>
    </main>
  );
}
