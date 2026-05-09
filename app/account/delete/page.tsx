"use client";

import { useState } from "react";

export default function DeleteAccountPage() {
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Failed to delete account");
      }

      setMessage("계정이 삭제되었습니다. 로그인 화면으로 이동합니다.");
      window.setTimeout(() => {
        window.location.assign("/");
      }, 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="delete-account-shell">
      <section className="delete-account-card">
        <p className="eyebrow">Delete account</p>
        <h1>계정 삭제</h1>
        <p>
          계정을 삭제하면 저장된 할일, 일정, worklog, 개인 설정이 함께 삭제됩니다.
          이 작업은 되돌릴 수 없습니다.
        </p>
        <label>
          계속하려면 <strong>DELETE</strong>를 입력하세요.
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE"
          />
        </label>
        <div className="guest-actions">
          <button
            className="danger-button"
            onClick={() => void deleteAccount()}
            disabled={busy || confirmation !== "DELETE"}
          >
            계정 영구 삭제
          </button>
          <button onClick={() => window.location.assign("/")} disabled={busy}>
            돌아가기
          </button>
        </div>
        {message ? <p className="meta">{message}</p> : null}
      </section>
    </main>
  );
}
