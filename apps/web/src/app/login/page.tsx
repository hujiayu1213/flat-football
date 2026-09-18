"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  async function submit(path: string, payload: object) {
    const response = await fetch(`/api/auth/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(typeof data.message === "string" ? data.message : "操作失败，请稍后再试");
    }
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await submit("send-code", { phone }); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await submit("verify-code", { phone, code }); setLoggedIn(true); window.dispatchEvent(new Event("auth-changed")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap login-page"><div className="login-card">
    <p className="eyebrow">家长与大学生老师</p><h1>手机号登录</h1>
    {loggedIn ? <div className="login-success"><p>登录成功。</p><Link className="button button-primary" href="/teach">继续申请成为老师</Link></div> : <>
      <p className="login-description">首次验证手机号时会自动创建账号。</p>
      <form onSubmit={sent ? verifyCode : sendCode}>
        <label>手机号<input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setSent(false); setCode(""); }} pattern="1[3-9][0-9]{9}" required maxLength={11} placeholder="中国大陆手机号" /></label>
        {sent && <label>短信验证码<input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} pattern="[0-9]{6}" required maxLength={6} placeholder="6 位验证码" /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "请稍候…" : sent ? "登录／注册" : "获取验证码"}</button>
      </form>
      {sent && <button className="text-button" type="button" onClick={() => setSent(false)}>重新获取验证码</button>}
      <p className="login-note">验证码 5 分钟内有效。请勿向他人透露验证码。</p>
    </>}
  </div></div>;
}
