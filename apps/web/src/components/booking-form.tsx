"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Offering } from "@/lib/catalog";

export function BookingForm({ offering }: { offering: Offering }) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [childAge, setChildAge] = useState("");
  const [meetingArea, setMeetingArea] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = new Date(startsAt);
    if (!Number.isFinite(date.getTime())) { setError("请选择有效的上课时间"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offeringId: offering.id, startsAt: date.toISOString(), childAge: Number(childAge), meetingArea, note }),
      });
      if (response.status === 401) { setError("请先登录，再提交预约"); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "预约提交失败");
      }
      setCreated(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "预约提交失败"); }
    finally { setBusy(false); }
  }

  if (created) return <div className="booking-success" role="status">预约请求已提交，等待老师确认。<Link href="/bookings">查看我的预约</Link></div>;
  return <div className="booking-widget">
    <button className="button button-primary" type="button" onClick={() => setOpen(!open)}>{open ? "收起预约" : offering.serviceKey === "flag_football" ? "预约腰旗训练" : "预约学科家教"}</button>
    {open && <form className="booking-form" onSubmit={(event) => void submit(event)}>
      <label>希望上课时间<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
      <label>学生年龄<input type="number" min="3" max="25" required value={childAge} onChange={(event) => setChildAge(event.target.value)} /></label>
      <label>上课区域<input type="text" minLength={2} maxLength={120} required placeholder="例如：海淀区中关村，具体地点待确认" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} /></label>
      <label>{offering.serviceKey === "tutoring" ? "想辅导的科目与学习目标" : "训练需求（选填）"}<textarea rows={3} required={offering.serviceKey === "tutoring"} minLength={offering.serviceKey === "tutoring" ? 2 : undefined} maxLength={500} placeholder={offering.serviceKey === "tutoring" ? "例如：初中数学，想加强应用题" : "例如：零基础体验、训练目标或场地要求"} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {offering.guardianRequired && <p className="form-hint">这门课需要家长在场。</p>}
      <p className="form-hint">提交后是预约请求，尚未确认上课。请勿在备注中填写详细住址或学生敏感信息。</p>
      {error && <p className="form-error" role="alert">{error} {error.includes("登录") && <Link href="/login">去登录</Link>}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "提交中…" : "提交预约请求"}</button>
    </form>}
  </div>;
}
