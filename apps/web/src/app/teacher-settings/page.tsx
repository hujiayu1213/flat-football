"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Availability {
  profileId: string; displayName: string; status: string; acceptingBookings: boolean;
}

export default function TeacherSettingsPage() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [view, setView] = useState<"loading" | "login" | "unavailable" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/teacher-availability/me", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (response.status === 403 || response.status === 409) { setView("unavailable"); return; }
        if (!response.ok) throw new Error();
        setAvailability(await response.json() as Availability);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  async function toggle() {
    if (!availability) return;
    const next = !availability.acceptingBookings;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/teacher-availability/me", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptingBookings: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "接单状态更新失败");
      }
      setAvailability(await response.json() as Availability);
      setMessage(next ? "已恢复接收新预约" : "已暂停接收新预约");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "接单状态更新失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap teacher-settings-page">
    <div className="page-heading"><p className="eyebrow">老师中心</p><h1>接单设置</h1><p>需要暂时休息时，可暂停新预约，之后随时恢复。</p></div>
    {view === "loading" && <p className="notice">正在读取接单状态…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link> 管理接单状态。</p>}
    {view === "unavailable" && <p className="notice">通过审核的老师可使用接单设置。<Link href="/teach">查看入驻状态</Link></p>}
    {view === "error" && <p className="notice" role="alert">接单状态暂时无法加载，请稍后重试。</p>}
    {view === "ready" && availability && <section className="teacher-settings-card">
      <h2>{availability.displayName}</h2>
      <p>当前状态：<strong>{availability.acceptingBookings ? "正在接收新预约" : "已暂停接单"}</strong></p>
      <p className="form-hint">暂停后，你的课程将暂时从可预约老师目录中隐藏。已有预约和老师端记录仍可查看、处理。</p>
      <button className={availability.acceptingBookings ? "button button-danger" : "button button-primary"} type="button" disabled={busy} onClick={() => void toggle()}>{busy ? "保存中…" : availability.acceptingBookings ? "暂停接单" : "恢复接单"}</button>
      {message && <p className="notice" role="status">{message}</p>}
      <Link className="back-link" href="/teacher-bookings">查看老师预约 →</Link>
    </section>}
  </div>;
}
