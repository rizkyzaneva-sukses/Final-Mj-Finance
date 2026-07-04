export default function PanelLoading() {
  return (
    <div className="page-stack">
      <section className="skeleton-grid">
        <div className="skeleton skeleton-line" style={{ width: "180px", height: "14px" }} />
        <div className="skeleton skeleton-line" style={{ width: "min(520px, 100%)", height: "54px" }} />
        <div className="skeleton skeleton-line" style={{ width: "min(680px, 100%)", height: "20px" }} />
      </section>

      <section className="skeleton-grid skeleton-grid-four">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </section>

      <section className="skeleton-grid skeleton-grid-two">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </section>
    </div>
  );
}
