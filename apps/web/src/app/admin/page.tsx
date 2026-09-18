"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Subject } from "@/lib/catalog";

interface ReviewSummary {
  id: string; type: string; status: string; submittedAt: string; displayName: string;
  school: string; serviceArea: string; phone: string;
}
interface ReviewDetail extends ReviewSummary {
  reviewNote: string | null;
  currentBio: string;
  currentSportsExperience: string;
  currentAcademicStrengths: string;
  currentEducationLevel: string;
  currentOfferings: Array<{ subjectId: string; subjectName: string; priceCents: number; durationMinutes: number }>;
  application: {
    serviceArea?: string; grade?: string; educationLevel?: string; academicStrengths?: string;
    bio?: string; experience?: string; sportsExperience?: string;
    offerings?: Array<{ subjectId: string; priceCents: number; durationMinutes: number; ageRange: string; venueRequirements: string; guardianRequired: boolean }>;
  };
  files: Array<{ id: string; kind: string; mimeType: string; byteSize: number }>;
}
type View = "loading" | "login" | "unauthorized" | "ready" | "error";
const statuses = [
  { value: "submitted", label: "待审核" }, { value: "approved", label: "已通过" },
  { value: "changes_requested", label: "已退回" }, { value: "rejected", label: "已拒绝" },
];

export default function AdminPage() {
  const [view, setView] = useState<View>("loading");
  const [status, setStatus] = useState("submitted");
  const [queue, setQueue] = useState<ReviewSummary[]>([]);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const me = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (me.status === 401) { setView("login"); return; }
        if (!me.ok) throw new Error();
        const account = await me.json() as { roles: string[] };
        if (!account.roles.includes("admin")) { setView("unauthorized"); return; }
        const subjectsResponse = await fetch("/api/subjects");
        if (subjectsResponse.ok) setSubjects(await subjectsResponse.json() as Subject[]);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  useEffect(() => {
    if (view !== "ready") return;
    async function loadQueue() {
      try {
        const response = await fetch(`/api/admin/verifications?status=${status}`, { credentials: "same-origin" });
        if (!response.ok) throw new Error();
        setQueue(await response.json() as ReviewSummary[]);
      } catch { setMessage("审核列表暂时无法加载"); }
    }
    void loadQueue();
  }, [view, status]);

  async function openReview(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/admin/verifications/${id}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error();
      setDetail(await response.json() as ReviewDetail);
      setNote("");
    } catch { setMessage("申请详情暂时无法加载"); }
  }

  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    if (!detail) return;
    if (decision !== "approved" && !note.trim()) { setMessage("退回或拒绝时请填写具体原因"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/verifications/${detail.id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ decision, note }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof result.message === "string" ? result.message : "审核失败");
      }
      setDetail(null);
      setQueue((current) => current.filter((item) => item.id !== detail.id));
      setMessage("审核结果已保存");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "审核失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap admin-page">
    <div className="page-heading"><p className="eyebrow">管理后台</p><h1>老师资料审核</h1><p>核对入驻与公开资料申请，记录审核结论。服务与价格调整可在服务管理页单独处理。</p></div>
    {view === "loading" && <p className="notice">正在读取管理员权限…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录管理员账号</Link>，再返回此页审核。</p>}
    {view === "unauthorized" && <p className="notice" role="alert">当前账号没有管理员权限。请使用已授权的管理员账号登录。</p>}
    {view === "error" && <p className="notice" role="alert">暂时无法加载后台，请稍后再试。</p>}
    {view === "ready" && <>
      <div className="admin-shortcuts"><Link href="/admin/subjects"><strong>服务管理与审核 →</strong><span>处理老师服务与价格调整；管理腰旗和家教上架状态</span></Link></div>
      <div className="admin-tabs" role="group" aria-label="审核状态">{statuses.map((item) => <button key={item.value} type="button" className={status === item.value ? "active" : ""} onClick={() => { setStatus(item.value); setDetail(null); setMessage(""); }}>{item.label}</button>)}</div>
      {message && <p className="notice" role="status">{message}</p>}
      <div className="admin-layout"><section className="admin-queue" aria-label="审核申请列表">
        {queue.length === 0 ? <p className="notice">当前没有此状态的申请。</p> : queue.map((item) => <button className={detail?.id === item.id ? "admin-queue-item selected" : "admin-queue-item"} type="button" key={item.id} onClick={() => void openReview(item.id)}>
          <strong>{item.displayName}</strong><span>{item.type === "profile_change" ? "公开资料修改" : item.type === "qualification_change" ? "课程项目调整" : "初次入驻"} · {item.school}</span><small>提交于 {new Date(item.submittedAt).toLocaleString("zh-CN")}</small>
        </button>)}
      </section><section className="admin-detail" aria-label="申请详情">
        {!detail ? <p className="notice">选择一条申请查看资料。</p> : <>
          <h2>{detail.displayName}</h2><p className="detail-meta">{detail.school} · {detail.serviceArea} · {detail.phone}</p>
          {detail.type === "profile_change" ? <>
            <h3>公开资料修改对比</h3>
            <dl className="review-fields"><dt>当前区域</dt><dd>{detail.serviceArea}</dd><dt>拟改区域</dt><dd>{detail.application.serviceArea}</dd><dt>当前介绍</dt><dd>{detail.currentBio}</dd><dt>拟改介绍</dt><dd>{detail.application.bio}</dd></dl>
            <p className="form-hint">初次入驻证明已审核；本次只修改服务区域和个人介绍。</p>
          </> : detail.type === "qualification_change" ? <>
            <h3>当前可约课程</h3><ul className="review-offerings">{detail.currentOfferings.map((offering) => <li key={offering.subjectId}>
              <strong>{offering.subjectName}</strong><span>¥{offering.priceCents / 100}／{offering.durationMinutes} 分钟</span>
            </li>)}</ul>
            <h3>拟调整为</h3><ul className="review-offerings">{detail.application.offerings?.map((offering) => <li key={offering.subjectId}>
              <strong>{subjects.find((subject) => subject.id === offering.subjectId)?.name ?? "项目已下架"}</strong>
              <span>¥{offering.priceCents / 100}／{offering.durationMinutes} 分钟{offering.ageRange && ` · ${offering.ageRange}`}</span>
              {offering.venueRequirements && <small>场地与装备：{offering.venueRequirements}</small>}
              {offering.guardianRequired && <small>需要家长在场</small>}
            </li>)}</ul>
            <dl className="review-fields"><dt>现有擅长科目</dt><dd>{detail.currentAcademicStrengths || "未填写"}</dd><dt>拟提交科目</dt><dd>{detail.application.academicStrengths || "未填写"}</dd><dt>现有运动经历</dt><dd>{detail.currentSportsExperience || "未填写"}</dd><dt>拟提交运动经历</dt><dd>{detail.application.sportsExperience || "未填写"}</dd></dl>
            <p className="form-hint">通过后课程列表整体替换；已有预约保留原价格与时长。</p>
            {detail.files.length > 0 && <><h3>补充证明</h3><div className="proof-grid">{detail.files.map((file) => <figure key={file.id}>
              <Image unoptimized src={`/api/admin/verifications/${detail.id}/files/${file.id}`} alt="体育资质证明" width={480} height={300} />
              <figcaption>体育资质证明</figcaption>
            </figure>)}</div></>}
          </> : <>
            <h3>申请资料</h3><dl className="review-fields"><dt>学历阶段</dt><dd>{detail.application.educationLevel}</dd><dt>年级</dt><dd>{detail.application.grade}</dd><dt>擅长科目</dt><dd>{detail.application.academicStrengths || "未填写"}</dd><dt>自我介绍</dt><dd>{detail.application.bio}</dd><dt>教学经历</dt><dd>{detail.application.experience}</dd>{detail.application.sportsExperience && <><dt>腰旗经历</dt><dd>{detail.application.sportsExperience}</dd></>}</dl>
            <h3>提供的服务</h3><ul className="review-offerings">{detail.application.offerings?.map((offering) => <li key={offering.subjectId}>
              <strong>{subjects.find((subject) => subject.id === offering.subjectId)?.name ?? "项目已下架"}</strong>
              <span>¥{offering.priceCents / 100}／{offering.durationMinutes} 分钟{offering.ageRange && ` · ${offering.ageRange}`}</span>
              {offering.venueRequirements && <small>场地与装备：{offering.venueRequirements}</small>}
              {offering.guardianRequired && <small>需要家长在场</small>}
            </li>)}</ul>
            <h3>证明材料</h3><div className="proof-grid">{detail.files.map((file) => <figure key={file.id}>
              <Image unoptimized src={`/api/admin/verifications/${detail.id}/files/${file.id}`} alt={file.kind === "student_proof" ? "在校证明" : "体育资质证明"} width={480} height={300} />
              <figcaption>{file.kind === "student_proof" ? "在校证明" : "体育资质证明"}</figcaption>
            </figure>)}</div>
          </>}
          {detail.reviewNote && <p className="review-note">历史审核备注：{detail.reviewNote}</p>}
          {detail.status === "submitted" && <div className="review-actions"><label>审核备注<textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="退回或拒绝时请说明具体原因" /></label><div>
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void decide("approved")}>通过</button>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide("changes_requested")}>退回补充</button>
            <button className="button button-danger" type="button" disabled={busy} onClick={() => void decide("rejected")}>拒绝</button>
          </div></div>}
        </>}
      </section></div>
    </>}
  </div>;
}
