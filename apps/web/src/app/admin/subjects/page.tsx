"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

interface ManagedSubject {
  id: string; name: string; category: "academic" | "sports";
  status: "active" | "hidden"; teacherCount: number;
}
interface ServiceReview {
  id: string; status: string; submittedAt: string; displayName: string; school: string;
}
interface Offering {
  subjectId: string; priceCents: number; durationMinutes: number;
  ageRange?: string; venueRequirements?: string; guardianRequired?: boolean;
}
interface ServiceReviewDetail extends ServiceReview {
  type: string;
  phone: string; reviewNote: string | null;
  currentAcademicStrengths: string; currentSportsExperience: string;
  currentOfferings: Array<Offering & { subjectName: string }>;
  application: { academicStrengths: string; sportsExperience: string; offerings: Offering[] };
  files: Array<{ id: string }>;
}
type ReviewStatus = "submitted" | "approved" | "changes_requested" | "rejected";
const reviewStatuses: Array<{ value: ReviewStatus; label: string }> = [
  { value: "submitted", label: "待审核" }, { value: "approved", label: "已通过" },
  { value: "changes_requested", label: "已退回" }, { value: "rejected", label: "已拒绝" },
];

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<ManagedSubject[]>([]);
  const [view, setView] = useState<"loading" | "login" | "unauthorized" | "ready" | "error">("loading");
  const [status, setStatus] = useState<ReviewStatus>("submitted");
  const [queue, setQueue] = useState<ServiceReview[]>([]);
  const [detail, setDetail] = useState<ServiceReviewDetail | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/subjects", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (response.status === 403) { setView("unauthorized"); return; }
        if (!response.ok) throw new Error();
        setSubjects(await response.json() as ManagedSubject[]);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  useEffect(() => {
    if (view !== "ready") return;
    let active = true;
    async function loadQueue() {
      setQueueLoading(true); setQueueError(false);
      try {
        const response = await fetch(`/api/admin/verifications?status=${status}&type=qualification_change`, { credentials: "same-origin" });
        if (!response.ok) throw new Error();
        const items = await response.json() as ServiceReview[];
        if (active) setQueue(items);
      } catch { if (active) setQueueError(true); }
      finally { if (active) setQueueLoading(false); }
    }
    void loadQueue();
    return () => { active = false; };
  }, [view, status]);

  async function openReview(id: string) {
    setMessage(""); setDetail(null);
    try {
      const response = await fetch(`/api/admin/verifications/${id}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const result = await response.json() as ServiceReviewDetail;
      if (result.type !== "qualification_change" || result.status !== status || !Array.isArray(result.application?.offerings)) throw new Error();
      setDetail(result); setNote("");
    } catch { setMessage("服务申请详情暂时无法加载，请刷新后重试"); }
  }

  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    if (!detail) return;
    if (decision !== "approved" && !note.trim()) { setMessage("退回或拒绝时请填写具体原因"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/verifications/${detail.id}/decision`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof result.message === "string" ? result.message : "审核失败");
      }
      setQueue((current) => current.filter((item) => item.id !== detail.id));
      setDetail(null);
      setMessage("服务审核结果已保存，老师会收到站内通知");
      if (decision === "approved") {
        const updated = await fetch("/api/admin/subjects", { credentials: "same-origin" });
        if (updated.ok) setSubjects(await updated.json() as ManagedSubject[]);
      }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "审核失败"); }
    finally { setBusy(false); }
  }

  async function toggle(subject: ManagedSubject) {
    const nextStatus = subject.status === "active" ? "hidden" : "active";
    if (nextStatus === "hidden" && !window.confirm(`下架“${subject.name}”后，家长将无法选择该项目。确定继续吗？`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/subjects/${subject.id}/status`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("状态更新失败，请刷新后重试");
      setSubjects((current) => current.map((item) => item.id === subject.id ? { ...item, status: nextStatus } : item));
      setMessage(nextStatus === "active" ? "平台服务已重新上架" : "平台服务已下架");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "状态更新失败"); }
    finally { setBusy(false); }
  }

  const nameFor = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? "项目已下架";

  return <div className="page-wrap admin-page">
    <Link className="back-link" href="/admin">← 返回老师审核</Link>
    <div className="page-heading"><p className="eyebrow">管理后台</p><h1>服务管理与审核</h1>
      <p>审核老师的腰旗与家教服务、价格调整，并管理平台开放的两项服务。</p></div>
    {view === "loading" && <p className="notice">正在加载服务管理…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/admin/login">登录管理员账号</Link>，再返回此页审核。</p>}
    {view === "unauthorized" && <p className="notice" role="alert">当前账号没有管理员权限。请<Link href="/admin/login">使用已授权的管理员手机号登录</Link>。</p>}
    {view === "error" && <p className="notice" role="alert">服务管理暂时无法加载，请稍后重试。</p>}
    {view === "ready" && <>
      {message && <p className="notice" role="status">{message}</p>}
      <section className="admin-service-section" aria-labelledby="service-review-heading">
        <div className="admin-section-heading"><h2 id="service-review-heading">老师服务申请</h2>
          <p>老师调整服务、价格或擅长科目后，在这里由管理员逐项审核。初次入驻仍在<Link href="/admin">老师审核</Link>处理。</p></div>
        <div className="admin-tabs" role="group" aria-label="服务申请状态">{reviewStatuses.map((item) =>
          <button key={item.value} type="button" className={status === item.value ? "active" : ""}
            onClick={() => { setStatus(item.value); setQueue([]); setDetail(null); setMessage(""); }}>{item.label}</button>)}</div>
        {queueError ? <p className="notice" role="alert">服务申请列表加载失败，请刷新重试。</p> :
          <div className="admin-layout"><div className="admin-queue" aria-label="服务申请列表">
            {queueLoading ? <p className="notice">正在读取申请…</p> : queue.length === 0 ?
              <p className="notice">当前没有此状态的服务申请。</p> : queue.map((item) =>
                <button key={item.id} type="button" className={detail?.id === item.id ? "admin-queue-item selected" : "admin-queue-item"}
                  onClick={() => void openReview(item.id)}>
                  <strong>{item.displayName}</strong><span>{item.school} · 服务与价格调整</span>
                  <small>提交于 {new Date(item.submittedAt).toLocaleString("zh-CN")}</small>
                </button>)}</div>
            <div className="admin-detail" aria-label="服务申请详情">{!detail ? <p className="notice">选择一条申请查看调整内容。</p> : <>
              <h2>{detail.displayName}</h2><p className="detail-meta">{detail.school} · {detail.phone}</p>
              <h3>当前可约服务</h3><ul className="review-offerings">{detail.currentOfferings.length === 0 ? <li>暂无</li> : detail.currentOfferings.map((offering, index) =>
                <li key={`${offering.subjectId}-${offering.durationMinutes}-${index}`}><strong>{offering.subjectName}</strong>
                  <span>¥{offering.priceCents / 100}／{offering.durationMinutes} 分钟</span></li>)}</ul>
              <h3>申请调整为</h3><ul className="review-offerings">{detail.application.offerings.map((offering, index) =>
                <li key={`${offering.subjectId}-${offering.durationMinutes}-${index}`}><strong>{nameFor(offering.subjectId)}</strong>
                  <span>¥{offering.priceCents / 100}／{offering.durationMinutes} 分钟{offering.ageRange && ` · ${offering.ageRange}`}</span>
                  {offering.venueRequirements && <small>场地与装备：{offering.venueRequirements}</small>}
                  {offering.guardianRequired && <small>需要家长在场</small>}</li>)}</ul>
              <dl className="review-fields"><dt>原擅长科目</dt><dd>{detail.currentAcademicStrengths || "未填写"}</dd>
                <dt>拟提交科目</dt><dd>{detail.application.academicStrengths || "未填写"}</dd>
                <dt>原运动经历</dt><dd>{detail.currentSportsExperience || "未填写"}</dd>
                <dt>拟提交经历</dt><dd>{detail.application.sportsExperience || "未填写"}</dd></dl>
              {detail.files.length > 0 && <><h3>补充证明</h3><div className="proof-grid">{detail.files.map((file) =>
                <figure key={file.id}><Image unoptimized src={`/api/admin/verifications/${detail.id}/files/${file.id}`}
                  alt="体育资质证明" width={480} height={300} /><figcaption>体育资质证明</figcaption></figure>)}</div></>}
              <p className="form-hint">通过后替换老师当前可约服务；已有预约按原价格和时长保留。</p>
              {detail.reviewNote && <p className="review-note">审核备注：{detail.reviewNote}</p>}
              {detail.status === "submitted" && <div className="review-actions"><label>审核备注
                <textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="退回或拒绝时请说明具体原因" /></label>
                <div><button className="button button-primary" type="button" disabled={busy} onClick={() => void decide("approved")}>通过</button>
                  <button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide("changes_requested")}>退回补充</button>
                  <button className="button button-danger" type="button" disabled={busy} onClick={() => void decide("rejected")}>拒绝</button></div></div>}
            </>}</div></div>}
      </section>
      <section className="admin-service-section" aria-labelledby="platform-service-heading">
        <div className="admin-section-heading"><h2 id="platform-service-heading">平台服务上架管理</h2>
          <p>平台开放腰旗橄榄球和学科家教两项服务。下架服务不会删除已有预约。</p></div>
        <div className="subject-management-list">{subjects.map((subject) => <article className="subject-management-item" key={subject.id}>
          <div><strong>{subject.name}</strong><span>{subject.category === "sports" ? "腰旗训练" : "大学生家教"} · 当前 {subject.teacherCount} 位老师</span></div>
          <div><span className={subject.status === "active" ? "subject-state active" : "subject-state"}>{subject.status === "active" ? "已上架" : "已下架"}</span>
            <button type="button" disabled={busy} onClick={() => void toggle(subject)}>{subject.status === "active" ? "下架" : "重新上架"}</button></div>
        </article>)}</div>
      </section>
    </>}
  </div>;
}
