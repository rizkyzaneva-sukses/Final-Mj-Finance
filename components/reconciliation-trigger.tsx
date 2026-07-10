"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { ReconciliationModal } from "@/components/reconciliation-modal";

type AccountInfo = {
  label: string;
  accountNumber: string | null;
  calculatedBalance: number;
};

export function ReconciliationTrigger({ accounts }: { accounts: AccountInfo[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="button button-dark" onClick={() => setOpen(true)}>
        <Scale size={17} /> Rekonsiliasi Saldo
      </button>
      {open && (
        <ReconciliationModal
          accounts={accounts}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
