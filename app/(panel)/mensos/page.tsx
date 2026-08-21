import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { MinistryPortalView } from "@/components/ministry-portal";
import { getSession, ministryHomePath } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ start?: string; end?: string }>;

const MENSOS_CODE = 4;

export default async function MensosDashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "MENSOS" && !(session.role === "MINISTRY" && session.ministryCode === MENSOS_CODE)) {
    redirect(session.role === "FINANCE" ? "/dashboard" : ministryHomePath(session));
  }

  const params = await searchParams;
  const mensos = await db.ministry.findUnique({ where: { code: MENSOS_CODE } });

  if (!mensos) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="KEMENSOS 26 SEJAHTERA"
          title="Data belum tersedia"
          icon={<BarChart3 size={26} />}
          description="Kementerian Sosial belum terdaftar di master data."
        />
      </div>
    );
  }

  return (
    <MinistryPortalView
      ministry={mensos}
      basePath="/mensos"
      eyebrow="KEMENSOS 26 SEJAHTERA"
      startParam={params.start}
      endParam={params.end}
    />
  );
}
