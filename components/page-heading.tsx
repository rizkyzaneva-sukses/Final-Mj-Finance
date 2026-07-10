export function PageHeading({ eyebrow, title, description, action, icon }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        {icon && <span className="page-heading-icon">{icon}</span>}
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {action && <div className="page-heading-actions">{action}</div>}
    </header>
  );
}
