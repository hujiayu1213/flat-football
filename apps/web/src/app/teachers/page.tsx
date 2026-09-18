import Link from "next/link";
import { getCatalog, Teacher } from "@/lib/catalog";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ category?: string; area?: string }>;

export default async function TeachersPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = await searchParams;
  const category = filters.category === "academic" || filters.category === "sports" ? filters.category : "";
  const area = filters.area?.trim() ?? "";
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (area) params.set("area", area);
  const tabHref = (value: string) => {
    const tabParams = new URLSearchParams();
    if (value) tabParams.set("category", value);
    if (area) tabParams.set("area", area);
    return `/teachers${tabParams.size ? `?${tabParams.toString()}` : ""}`;
  };

  let teachers: Teacher[] = [];
  let unavailable = false;
  try { teachers = await getCatalog<Teacher[]>(`teachers?${params.toString()}`); }
  catch { unavailable = true; }

  return <div className="page-wrap catalog-page focused-catalog">
    <div className="page-heading"><p className="eyebrow">运动与学习，一起向前</p><h1>为爱运动的孩子，找到合适的支持。</h1><p>想继续练腰旗，或需要学习辅导？先看老师的腰旗经历、院校学历与擅长科目，再按孩子的需要预约。</p></div>
    <div className="service-tabs" role="group" aria-label="服务方向">
      <Link href={tabHref("")} className={!category ? "active" : ""}>全部老师</Link>
      <Link href={tabHref("sports")} className={category === "sports" ? "active" : ""}>腰旗训练</Link>
      <Link href={tabHref("academic")} className={category === "academic" ? "active" : ""}>学习辅导</Link>
    </div>
    <form className="filter-panel focused-filter" method="get">
      {category && <input type="hidden" name="category" value={category} />}
      <label>服务区域<input name="area" type="search" maxLength={60} placeholder="例如：海淀区、朝阳区" defaultValue={area} /></label>
      <button className="button button-primary" type="submit">按区域查找</button>
    </form>
    {!unavailable && <div className="catalog-result-bar"><strong>{category === "sports" ? "腰旗训练" : category === "academic" ? "学习辅导" : "可预约老师"} · {teachers.length} 位</strong><span>老师资料通过审核后展示</span></div>}
    {unavailable ? <p className="notice" role="status">老师资料暂时无法加载，请稍后再试。</p> : teachers.length === 0 ?
      <p className="notice" role="status">暂时没有符合条件的老师，可以换个区域再看看。</p> :
      <div className="teacher-grid">{teachers.map((teacher) => {
        const flag = teacher.offerings.find((item) => item.serviceKey === "flag_football");
        const tutoring = teacher.offerings.find((item) => item.serviceKey === "tutoring");
        const featured = flag ?? tutoring ?? teacher.offerings[0];
        return <article className="teacher-card focused-teacher-card" key={teacher.id}>
          <div className="teacher-card-heading"><div className="avatar" aria-hidden="true">{teacher.displayName.slice(0, 1)}</div><div><h2>{teacher.displayName}</h2><p>{teacher.school} · {teacher.educationLevel}</p></div><span className="verified-pill">已审核</span></div>
          <div className="teacher-service-badges">{flag && <span className="flag-badge">腰旗训练</span>}{tutoring && <span>学习辅导</span>}</div>
          <div className="teacher-key-facts"><p><strong>学历</strong>{teacher.school} · {teacher.educationLevel}{teacher.grade && ` · ${teacher.grade}`}</p>
            {teacher.academicStrengths && <p><strong>擅长科目</strong>{teacher.academicStrengths}</p>}
            <p><strong>服务区域</strong>{teacher.serviceArea}</p></div>
          {flag && <p className="teacher-bio">{teacher.sportsExperience || teacher.bio || "查看老师资料，了解腰旗训练方式。"}</p>}
          <div className="teacher-card-bottom"><span><small>{flag ? "腰旗训练" : "家教服务"}参考价格</small>¥{featured.priceCents / 100} <small>／次</small></span><Link href={`/teachers/${teacher.id}`}>了解老师 <span aria-hidden="true">↗</span></Link></div>
        </article>;
      })}</div>}
  </div>;
}
