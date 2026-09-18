"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TeacherBooking {
  id: string; status: string; startsAt: string; durationMinutes: number; priceCents: number;
  childAge: number; meetingArea: string; note: string; guardianRequired: boolean;
  teacherResponseNote: string | null; parentPhone: string; subjectName: string;
  cancelledBy: "parent" | "teacher" | null; cancellationReason: string | null;
  completedAt: string | null;
}
const statusText: Record<string, string> = {
  requested: "待处理", confirmed: "已确认", declined: "已拒绝", cancelled: "家长已取消", completed: "已完成",
};

export default function TeacherBookingsPage() {
  const [bookings, setBookings] = useState<TeacherBooking[]>([]);
  const [view, setView] = useState<"loading" | "login" | "forbidden" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/bookings/teacher", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (response.status === 403) { setView("forbidden"); return; }
        if (!response.ok) throw new Error();
        setBookings(await response.json() as TeacherBooking[]);
        setNow(Date.now());
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function decide(id: string, decision: "confirmed" | "declined") {
    const note = (notes[id] ?? "").trim();
    if (decision === "declined" && !note) { setMessage("拒绝预约时请填写原因"); return; }
    setBusyId(id); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${id}/teacher-decision`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "处理失败，请刷新后重试");
      }
      setBookings((current) => current.map((item) => item.id === id ? { ...item, status: decision, teacherResponseNote: note } : item));
      setMessage(decision === "confirmed" ? "预约已确认" : "已告知家长拒绝原因");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "处理失败"); }
    finally { setBusyId(""); }
  }

  async function cancelConfirmed(id: string) {
    const reason = (cancelReasons[id] ?? "").trim();
    if (reason.length < 2) { setMessage("请填写至少 2 字的取消原因"); return; }
    if (!window.confirm("确定取消这门已确认的课程吗？家长会收到通知。")) return;
    setBusyId(id); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${id}/teacher-cancel`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "取消失败，请刷新后重试");
      }
      setBookings((current) => current.map((item) => item.id === id ? { ...item, status: "cancelled", cancelledBy: "teacher", cancellationReason: reason } : item));
      setMessage("课程已取消，家长将收到站内通知");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "取消失败"); }
    finally { setBusyId(""); }
  }

  async function complete(id: string) {
    if (!window.confirm("确认课程已经结束并标记完成吗？家长会收到通知。")) return;
    setBusyId(id); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${id}/teacher-complete`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "操作失败，请刷新后重试");
      }
      const result = await response.json() as { completedAt: string };
      setBookings((current) => current.map((item) => item.id === id ? { ...item, status: "completed", completedAt: result.completedAt } : item));
      setMessage("课程已标记完成，家长将收到站内通知");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusyId(""); }
  }

  return <div className="page-wrap bookings-page">
    <div className="page-heading"><p className="eyebrow">老师中心</p><h1>预约请求</h1><p>处理预约请求，并在课程结束后确认完成。</p></div>
    {view === "loading" && <p className="notice">正在加载预约…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link> 查看预约。</p>}
    {view === "forbidden" && <p className="notice">通过入驻审核的老师可查看预约。<Link href="/teach">查看入驻状态</Link></p>}
    {view === "error" && <p className="notice" role="alert">预约暂时无法加载，请稍后重试。</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {view === "ready" && (bookings.length ? <div className="booking-list">{bookings.map((booking) => <article className="booking-card" key={booking.id}>
      <div className="booking-card-top"><h2>{booking.subjectName}</h2><span>{booking.status === "cancelled" && booking.cancelledBy === "teacher" ? "老师已取消" : statusText[booking.status] ?? booking.status}</span></div>
      <p>希望上课：{new Date(booking.startsAt).toLocaleString("zh-CN")} · {booking.durationMinutes} 分钟 · ¥{booking.priceCents / 100}／次</p>
      <p>学生 {booking.childAge} 岁 · {booking.meetingArea}{booking.guardianRequired && " · 需家长在场"}</p>
      <p>家长手机：{booking.parentPhone}</p>
      {booking.note && <p>需求备注：{booking.note}</p>}
      {booking.teacherResponseNote && <p>老师回复：{booking.teacherResponseNote}</p>}
      {booking.cancellationReason && <p>取消原因：{booking.cancellationReason}</p>}
      {booking.completedAt && <p>完成时间：{new Date(booking.completedAt).toLocaleString("zh-CN")}</p>}
      {booking.status === "requested" && <div className="teacher-decision">
        <label>回复家长（拒绝时必填）<textarea rows={2} maxLength={500} value={notes[booking.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [booking.id]: event.target.value }))} placeholder="例如：当天已无空余时间，请选择其他时段" /></label>
        <div><button className="button button-primary" type="button" disabled={busyId === booking.id} onClick={() => void decide(booking.id, "confirmed")}>确认预约</button>
          <button className="button button-danger" type="button" disabled={busyId === booking.id} onClick={() => void decide(booking.id, "declined")}>拒绝预约</button></div>
      </div>}
      {booking.status === "confirmed" && new Date(booking.startsAt).getTime() > now && <div className="teacher-decision">
        <label>取消原因（必填）<textarea rows={2} minLength={2} maxLength={500} value={cancelReasons[booking.id] ?? ""} onChange={(event) => setCancelReasons((current) => ({ ...current, [booking.id]: event.target.value }))} placeholder="请说明无法上课的原因，便于家长重新安排" /></label>
        <div><button className="button button-danger" type="button" disabled={busyId === booking.id} onClick={() => void cancelConfirmed(booking.id)}>取消已确认课程</button></div>
      </div>}
      {booking.status === "confirmed" && new Date(booking.startsAt).getTime() + booking.durationMinutes * 60000 <= now && <div className="teacher-decision">
        <div><button className="button button-primary" type="button" disabled={busyId === booking.id} onClick={() => void complete(booking.id)}>标记课程完成</button></div>
      </div>}
    </article>)}</div> : <p className="notice">暂时没有预约请求。</p>)}
  </div>;
}
