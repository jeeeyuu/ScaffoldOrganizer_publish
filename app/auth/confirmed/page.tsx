import Link from "next/link";

export default function AuthConfirmedPage() {
  return (
    <main className="auth-confirm-shell">
      <section className="auth-confirm-card">
        <p className="eyebrow">Email confirmed</p>
        <h1>이메일 인증이 완료되었습니다.</h1>
        <p>현재 페이지는 닫아도 괜찮습니다.</p>
        <p className="meta">앱을 계속 사용하려면 로그인 화면으로 돌아가 다시 로그인해주세요.</p>
        <Link href="/">Back to Scaffold Organizer</Link>
      </section>
    </main>
  );
}
