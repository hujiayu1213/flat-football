import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page-wrap home-page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> 给热爱体育的孩子</p>
          <h1 id="hero-title">热爱运动，<br /><span>学习也能跟上。</span></h1>
          <p className="lead">让孩子继续享受腰旗橄榄球，也能在需要时获得学习支持。这里有大学生腰旗教练和家教，帮助家长按孩子的训练与学习需求找到合适的人。</p>
          <div className="actions">
            <Link className="button button-primary" href="/teachers">为孩子找老师 <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="hero-assurance"><span>✓ 资料审核后展示</span><span>✓ 预约状态随时可查</span></div>
        </div>
        <div className="hero-showcase flag-showcase" aria-label="运动与学习支持示意">
          <div className="showcase-orbit showcase-orbit-one" /><div className="showcase-orbit showcase-orbit-two" />
          <div className="showcase-heading"><span className="showcase-spark">✳</span><span>孩子的两种需要<br /><strong>一起被认真对待</strong></span></div>
          <div className="showcase-course showcase-course-sports"><span className="showcase-icon" aria-hidden="true">↗</span><div><small>热爱运动</small><strong>在腰旗场上尽情奔跑</strong><span>寻找有训练经历的大学生教练</span></div><span className="showcase-arrow" aria-hidden="true">↗</span></div>
          <div className="showcase-connection"><span>运动的热爱</span><i aria-hidden="true" /><span>学习的支持</span></div>
          <div className="showcase-course showcase-course-academic"><span className="showcase-icon" aria-hidden="true">∑</span><div><small>兼顾学习</small><strong>需要时有人辅导</strong><span>了解院校、学历与擅长科目</span></div><span className="showcase-arrow" aria-hidden="true">↗</span></div>
          <div className="showcase-caption">继续运动，也认真学习。</div>
        </div>
      </section>
      <section className="home-process" aria-labelledby="process-title">
        <div className="section-intro"><div><p className="eyebrow">怎么开始</p><h2 id="process-title">从孩子的热爱和需要出发。</h2></div><p>训练与辅导可以分别预约，按孩子当下的情况选择。</p></div>
        <div className="feature-grid">
          <article className="feature-card"><span>01 / 坚持热爱</span><div className="feature-symbol" aria-hidden="true">↗</div><h3>继续练腰旗</h3><p>按区域查看教练的腰旗经历，为孩子找到合适的训练支持。</p></article>
          <article className="feature-card"><span>02 / 跟上学习</span><div className="feature-symbol" aria-hidden="true">∑</div><h3>需要时找家教</h3><p>看大学生老师的院校、学历和擅长科目，再说明学习难点。</p></article>
          <article className="feature-card"><span>03 / 安排时间</span><div className="feature-symbol" aria-hidden="true">✓</div><h3>分别提出预约</h3><p>为训练或辅导选择时间，提交需求后等待老师确认。</p></article>
        </div>
      </section>
      <section className="home-cta"><div><p className="eyebrow">大学生老师招募中</p><h2>陪孩子坚持运动，也支持他们认真学习。</h2><p>如果你能教腰旗或擅长学科辅导，提交资料通过审核后即可展示。</p></div><Link className="button button-light" href="/teach">申请成为老师 <span aria-hidden="true">↗</span></Link></section>
    </div>
  );
}
