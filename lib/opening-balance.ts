export const OPENING_BALANCE_PREFIX = "OPENING_BALANCE:";

function normalizeAccountPart(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}

export function openingBalanceReference(accountHolder: string, accountNumber?: string | null) {
  const holder = normalizeAccountPart(accountHolder);
  const number = String(accountNumber || "").replace(/\D/g, "");
  return `${OPENING_BALANCE_PREFIX}${number || holder}`;
}

export function isOpeningBalanceReference(reference: string | null | undefined) {
  return String(reference || "").startsWith(OPENING_BALANCE_PREFIX);
}
