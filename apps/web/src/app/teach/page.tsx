"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Subject } from "@/lib/catalog";

interface OfferingForm {
  subjectId: string; priceYuan: string; durationMinutes: string; ageRange: string;
  venueRequirements: string; guardianRequired: boolean;
}
interface ApplicationForm {
  displayName: string; school: string; grade: string; educationLevel: string;
  academicStrengths: string; serviceArea: string;
  bio: string; experience: string; sportsExperience: string; offerings: OfferingForm[];
}
const emptyOffering = (): OfferingForm => ({ subjectId: "", priceYuan: "", durationMinutes: "60", ageRange: "", venueRequirements: "", guardianRequired: false });
const emptyApplication = (): ApplicationForm => ({ displayName: "", school: "", grade: "", educationLevel: "", academicStrengths: "", serviceArea: "", bio: "", experience: "", sportsExperience: "", offerings: [emptyOffering()] });
type View = "loading" | "login" | "form" | "submitted" | "approved" | "error";

export default function TeachPage() {
  const [view, setView] = useState<View>("loading");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [form, setForm] = useState<ApplicationForm>(emptyApplication);
  const [studentProof, setStudentProof] = useState<File | null>(null);
  const [sportsProof, setSportsProof] = useState<File | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const auth = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (auth.status === 401) { setView("login"); return; }
        if (!auth.ok) throw new Error("无法读取登录状态");
        const [subjectsResponse, applicationResponse] = await Promise.all([
          fetch("/api/subjects"), fetch("/api/teacher-application/me", { credentials: "same-origin" }),
        ]);
        if (!subjectsResponse.ok || !applicationResponse.ok) throw new Error("暂时无法读取申请资料");
        setSubjects(await subjectsResponse.json() as Subject[]);
        const application = await applicationResponse.json() as { status: string; reviewNote?: string; application?: Record<string, unknown> };
        if (application.status === "submitted") { setView("submitted"); return; }
        if (application.status === "approved" || application.status === "active") { setView("approved"); return; }
        if (application.application) {
          const saved = application.application;
          const offerings = Array.isArray(saved.offerings) ? saved.offerings.map((item) => {
            const row = item as Record<string, unknown>;
            return { subjectId: String(row.subjectId ?? ""), priceYuan: String(Number(row.priceCents ?? 0) / 100),
              durationMinutes: String(row.durationMinutes ?? 60), ageRange: String(row.ageRange ?? ""),
              venueRequirements: String(row.venueRequirements ?? ""), guardianRequired: row.guardianRequired === true };
          }) : [emptyOffering()];
          setForm({ displayName: String(saved.displayName ?? ""), school: String(saved.school ?? ""), grade: String(saved.grade ?? ""),
            educationLevel: String(saved.educationLevel ?? ""), academicStrengths: String(saved.academicStrengths ?? ""),
            serviceArea: String(saved.serviceArea ?? ""), bio: String(saved.bio ?? ""), experience: String(saved.experience ?? ""),
            sportsExperience: String(saved.sportsExperience ?? ""), offerings });
        }
        setReviewNote(application.reviewNote ?? "");
        setView("form");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "加载失败"); setView("error"); }
    }
    void load();
  }, []);

  function updateField(name: keyof Omit<ApplicationForm, "offerings">, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  function updateOffering(index: number, patch: Partial<OfferingForm>) {
    setForm((current) => ({ ...current, offerings: current.offerings.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  }
  const hasSports = form.offerings.some((offering) => subjects.find((subject) => subject.id === offering.subjectId)?.category === "sports");
  const hasAcademic = form.offerings.some((offering) => subjects.find((subject) => subject.id === offering.subjectId)?.service_key === "tutoring");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentProof) { setError("请上传在校证明图片"); return; }
    setBusy(true); setError("");
    const payload = { ...form, offerings: form.offerings.map((offering) => ({
      subjectId: offering.subjectId, priceCents: Math.round(Number(offering.priceYuan) * 100),
      durationMinutes: Number(offering.durationMinutes), ageRange: offering.ageRange,
      venueRequirements: offering.venueRequirements, guardianRequired: offering.guardianRequired,
    })) };
    const body = new FormData();
    body.append("application", JSON.stringify(payload)); body.append("studentProof", studentProof);
    if (hasSports && sportsProof) body.append("sportsProof", sportsProof);
    try {
      const response = await fetch("/api/teacher-application", { method: "POST", credentials: "same-origin", body });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof result.message === "string" ? result.message : "提交失败，请稍后再试");
      }
      setView("submitted");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap application-page">
    <div className="page-heading"><p className="eyebrow">腰旗教练与大学生家教入驻</p><h1>成为老师</h1><p>选择腰旗训练、学科家教或同时提供两种服务，填写学历与擅长方向后提交审核。</p></div>
    {view === "loading" && <p className="notice" role="status">正在读取申请状态…</p>}
    {view === "login" && <div className="notice"><p>请先登录，再填写入驻申请。</p><Link className="button button-primary" href="/teacher/login">老师登录</Link></div>}
    {view === "error" && <p className="notice" role="alert">{error}</p>}
    {view === "submitted" && <div className="notice"><h2>申请已提交</h2><p>资料正在等待管理员审核。审核结果会显示在这里。</p></div>}
    {view === "approved" && <div className="notice"><h2>审核已通过</h2><p>你现在可以管理预约、公开资料和教学项目。</p><Link className="button button-primary" href="/teacher-profile">修改公开资料</Link> <Link className="button button-secondary" href="/teacher-offerings">调整教学项目</Link></div>}
    {view === "form" && <form className="application-form" onSubmit={submit}>
      {reviewNote && <p className="review-note" role="status">审核反馈：{reviewNote}</p>}
      <section className="form-section"><h2>基本资料</h2><div className="form-grid">
        <label>展示名称<input required maxLength={80} value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} /></label>
        <label>学校<input required maxLength={120} value={form.school} onChange={(event) => updateField("school", event.target.value)} /></label>
        <label>学历阶段<select required value={form.educationLevel} onChange={(event) => updateField("educationLevel", event.target.value)}><option value="">请选择</option><option value="大专在读">大专在读</option><option value="本科在读">本科在读</option><option value="硕士在读">硕士在读</option><option value="博士在读">博士在读</option></select></label>
        <label>年级<input required maxLength={40} value={form.grade} onChange={(event) => updateField("grade", event.target.value)} placeholder="例如：大三" /></label>
        <label>服务区域<input required maxLength={120} value={form.serviceArea} onChange={(event) => updateField("serviceArea", event.target.value)} placeholder="例如：海淀区" /></label>
        <label className="wide">自我介绍<textarea required maxLength={1000} rows={3} value={form.bio} onChange={(event) => updateField("bio", event.target.value)} /></label>
        <label className="wide">教学经历<textarea required maxLength={1000} rows={3} value={form.experience} onChange={(event) => updateField("experience", event.target.value)} /></label>
      </div></section>
      <section className="form-section"><h2>提供的服务</h2><p className="form-hint">只需选择腰旗橄榄球或学科家教，无需把数学、语文等科目分别开课。</p>
        {form.offerings.map((offering, index) => {
          const sports = subjects.find((subject) => subject.id === offering.subjectId)?.category === "sports";
          return <div className="offering-form" key={index}><div className="form-grid">
            <label>服务类型<select required value={offering.subjectId} onChange={(event) => updateOffering(index, { subjectId: event.target.value })}><option value="">请选择</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>单次价格（元）<input required type="number" min={10} max={2000} step="0.01" value={offering.priceYuan} onChange={(event) => updateOffering(index, { priceYuan: event.target.value })} /></label>
            <label>单次时长（分钟）<input required type="number" min={30} max={180} value={offering.durationMinutes} onChange={(event) => updateOffering(index, { durationMinutes: event.target.value })} /></label>
            <label>适合年龄段<input maxLength={60} value={offering.ageRange} onChange={(event) => updateOffering(index, { ageRange: event.target.value })} placeholder="例如：10—15 岁" /></label>
            {sports && <><label className="wide">场地与装备要求<textarea required maxLength={500} rows={2} value={offering.venueRequirements} onChange={(event) => updateOffering(index, { venueRequirements: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={offering.guardianRequired} onChange={(event) => updateOffering(index, { guardianRequired: event.target.checked })} />要求家长在场</label></>}
          </div>{form.offerings.length > 1 && <button className="text-button" type="button" onClick={() => setForm((current) => ({ ...current, offerings: current.offerings.filter((_, position) => position !== index) }))}>移除项目</button>}</div>;
        })}
        {form.offerings.length < 2 && <button className="button button-secondary" type="button" onClick={() => setForm((current) => ({ ...current, offerings: [...current.offerings, emptyOffering()] }))}>再添加一种服务</button>}
      </section>
      {hasAcademic && <section className="form-section"><h2>家教擅长科目</h2><label>擅长科目和适合年级<input required minLength={2} maxLength={240} value={form.academicStrengths} onChange={(event) => updateField("academicStrengths", event.target.value)} placeholder="例如：初中数学、英语阅读" /></label><p className="form-hint">这里展示你的强项，家长预约时再写具体学习需求。</p></section>}
      {hasSports && <section className="form-section"><h2>腰旗教学经历</h2><label>运动与教学经历<textarea required minLength={10} maxLength={1000} rows={3} value={form.sportsExperience} onChange={(event) => updateField("sportsExperience", event.target.value)} /></label></section>}
      <section className="form-section"><h2>证明材料</h2><p className="form-hint">仅审核人员可查看。请上传清晰的 JPG 或 PNG 图片，每张不超过 5MB。</p>
        <label>在校证明（必填）<input required type="file" accept="image/jpeg,image/png" onChange={(event) => setStudentProof(event.target.files?.[0] ?? null)} /></label>
        {hasSports && <label>体育资质证明（如有）<input type="file" accept="image/jpeg,image/png" onChange={(event) => setSportsProof(event.target.files?.[0] ?? null)} /></label>}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary submit-application" type="submit" disabled={busy}>{busy ? "正在提交…" : "提交审核"}</button>
    </form>}
  </div>;
}
