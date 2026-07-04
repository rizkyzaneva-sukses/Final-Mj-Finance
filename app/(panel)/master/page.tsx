import { redirect } from "next/navigation";
import { MasterManager } from "@/components/master-manager";
import { PageHeading } from "@/components/page-heading";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  const session = await getSession();
  if (session?.role !== "FINANCE") redirect("/dashboard");
  const [ministries, incomeMasters, expenseTypes] = await Promise.all([
    db.ministry.findMany({
      orderBy: { code: "asc" },
      include: {
        events: {
          orderBy: { name: "asc" },
          include: { incomeTypes: { orderBy: { name: "asc" }, include: { incomeMaster: true } } },
        },
      },
    }),
    db.incomeMaster.findMany({ orderBy: { name: "asc" } }),
    db.expenseType.findMany({ orderBy: { name: "asc" } }),
  ]);
  const data = ministries.map((ministry) => ({
    id: ministry.id,
    code: ministry.code,
    name: ministry.name,
    active: ministry.active,
    events: ministry.events.map((event) => ({
      id: event.id,
      name: event.name,
      category: event.category,
      active: event.active,
      ministryId: event.ministryId,
      incomeTypes: event.incomeTypes.map((type) => ({
        id: type.id,
        name: type.name,
        uniqueCode: type.uniqueCode,
        incomeMasterId: type.incomeMasterId,
        incomeMasterName: type.incomeMaster?.name || type.name,
        active: type.active,
        eventId: type.eventId,
      })),
    })),
  }));
  return <div className="page-stack"><PageHeading eyebrow="KAMUS KEUANGAN" title="Atur kode, lalu biarkan sistem bekerja." description="Setiap jenis pemasukan memiliki kode akhir nominal yang unik. Kode kementerian tidak memakai nol di depan." /><MasterManager ministries={data} incomeMasters={incomeMasters} expenseTypes={expenseTypes} /></div>;
}
