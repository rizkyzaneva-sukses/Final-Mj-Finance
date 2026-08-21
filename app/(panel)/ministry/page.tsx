import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { MinistryPortalView } from "@/components/ministry-portal";
import { getSession, isMinistryScoped, ministryHomePath } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ start?: string; end?: string }>;

export default async function MinistryDashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "FINANCE") redirect("/dashboard");
  if (session.role === "MENSOS" || session.ministryCode === 4) redirect("/mensos");
  if (!isMinistryScoped(session)) redirect("/login");

  const params = await searchParams;
  const ministry = session.ministryId
    ? await db.ministry.findUnique({ where: { id: session.ministryId } })
    : await db.ministry.findUnique({ where: { code: session.ministryCode } });

  if (!ministry) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="PORTAL KEMENTERIAN"
          title="Data belum tersedia"
          icon={<BarChart3 size={26} />}
          description="Kementerian Anda belum terdaftar di master data."
        />
      </div>
    );
  }

  if (session.ministryId && ministry.id !== session.ministryId) {
    redirect(ministryHomePath(session));
  }

  return (
    <MinistryPortalView
      ministry={ministry}
      basePath="/ministry"
      startParam={params.start}
      endParam={params.end}
    />
  );
}
