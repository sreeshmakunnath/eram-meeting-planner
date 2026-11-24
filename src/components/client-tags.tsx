/** Small tags beside a client's name: vendor registration completed, and (Super Admins) competing units. */
export function ClientTags({ vendorCode, otherUnits }: { vendorCode: string | null | undefined; otherUnits?: string | null }) {
  if (vendorCode == null && !otherUnits) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {vendorCode != null && (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800 ring-1 ring-green-200" title={vendorCode ? `Vendor code ${vendorCode}` : "Vendor registration completed"}>
          Vendor registered{vendorCode ? ` · ${vendorCode}` : ""}
        </span>
      )}
      {otherUnits && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200" title="The same company is a client of other business units: they compete for it. Only Super Admins see this.">
          Also in {otherUnits} · competition
        </span>
      )}
    </span>
  );
}
