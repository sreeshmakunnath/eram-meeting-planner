"use client";
import { useState } from "react";
import { Field } from "@/components/ui";

type Unit = { id: number; name: string };
type Owner = { id: number; name: string; buIds: number[] };

/**
 * The client's business unit and account owner. The owner list follows the unit: only its members, since the
 * account owner sees all of the client's bids and a client belongs to one unit.
 */
export function UnitOwnerFields({
  units,
  defaultUnitId,
  fixedUnit,
  fixedHint,
  unitHint,
  owners,
  defaultOwnerId,
  ownerLocked,
}: {
  /** Units the person may pick; ignored when `fixedUnit` is set. */
  units: Unit[];
  defaultUnitId: number | null;
  /** Shown read-only when the person can't change the unit. */
  fixedUnit?: Unit | null;
  fixedHint?: string;
  unitHint: string;
  owners: Owner[];
  defaultOwnerId: number | null;
  /** The editor can't change the account owner. */
  ownerLocked: boolean;
}) {
  const [unitId, setUnitId] = useState<number | null>(fixedUnit ? fixedUnit.id : defaultUnitId);
  const [ownerId, setOwnerId] = useState<number | null>(defaultOwnerId);
  const members = unitId ? owners.filter((o) => o.buIds.map(Number).includes(unitId)) : [];
  const ownerOk = !ownerId || members.some((m) => m.id === ownerId);
  const current = owners.find((o) => o.id === ownerId);

  const pickUnit = (id: number | null) => {
    setUnitId(id);
    // The owner must be a member of the new unit
    if (ownerId && !owners.some((o) => o.id === ownerId && id && o.buIds.map(Number).includes(id))) setOwnerId(null);
  };

  return (
    <>
      {fixedUnit !== undefined && fixedUnit !== null ? (
        <div>
          <span className="label">Business unit</span>
          <p className="text-sm text-slate-700">
            {fixedUnit.name}
            {fixedHint && <span className="block text-xs text-slate-500">{fixedHint}</span>}
          </p>
        </div>
      ) : (
        <Field label="Business unit *" hint={unitHint}>
          <select name="businessUnitId" className="input" value={unitId ?? ""} onChange={(e) => pickUnit(e.target.value ? Number(e.target.value) : null)} required>
            {units.length !== 1 && <option value="">Select…</option>}
            {units.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        label="Account owner"
        hint={
          ownerLocked
            ? "Only an Admin, the account owner or their manager can change this."
            : !unitId
              ? "Pick the business unit first: the account owner must be a member of it."
              : !ownerOk
                ? "The current account owner isn't a member of this business unit. Pick someone who is."
                : "Main ERAM contact for this client; must be a member of its business unit."
        }
      >
        {ownerLocked ? (
          <select className="input" value={ownerId ?? ""} disabled>
            <option value="">—</option>
            {current && <option value={current.id}>{current.name}</option>}
          </select>
        ) : (
          <select name="accountOwnerId" className="input" value={ownerOk ? (ownerId ?? "") : ""} onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)} disabled={!unitId}>
            <option value="">—</option>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  );
}
