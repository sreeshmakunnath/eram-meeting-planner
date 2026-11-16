"use client";
import { useState } from "react";

export type ClientOpt = { id: number; name: string; code: string | null; buIds: number[] };
type Unit = { id: number; name: string };
export type OwnerOpt = { id: number; name: string; buIds: number[] };
export type ProjectOpt = { id: number; clientId: number; name: string };

/**
 * Client, business unit and owner pickers for a bid. The unit list follows the client (only the client's units
 * that the person may use, picked automatically when there is just one), and the owner list follows the unit:
 * only its members, since nobody outside a bid's unit may see it.
 */
export function ClientUnitFields({
  clients,
  units,
  defaultClientId,
  defaultUnitId,
  owners,
  defaultOwnerId,
  projects,
  defaultProjectId,
  disabled,
}: {
  clients: ClientOpt[];
  /** Units the person may put a bid in. */
  units: Unit[];
  defaultClientId?: number | null;
  defaultUnitId?: number | null;
  owners: OwnerOpt[];
  defaultOwnerId?: number | null;
  /** Projects of the listed clients; the picker shows the chosen client's. */
  projects: ProjectOpt[];
  defaultProjectId?: number | null;
  disabled?: boolean;
}) {
  const [clientId, setClientId] = useState<number | null>(defaultClientId ?? null);
  const client = clients.find((c) => c.id === clientId);
  const options = client ? units.filter((u) => client.buIds.includes(u.id)) : [];
  const [picked, setPicked] = useState<number | null>(defaultUnitId ?? null);
  const unitId = options.length === 1 ? options[0].id : options.some((u) => u.id === picked) ? picked : null;
  const members = unitId ? owners.filter((o) => o.buIds.includes(unitId)) : [];
  const [ownerId, setOwnerId] = useState<number | null>(defaultOwnerId ?? null);
  const owner = members.some((o) => o.id === ownerId) ? ownerId : null;
  const clientProjects = clientId ? projects.filter((p) => p.clientId === clientId) : [];
  const [projectPick, setProjectPick] = useState<string>(defaultProjectId ? String(defaultProjectId) : "");
  const project = projectPick === "__new" || clientProjects.some((p) => String(p.id) === projectPick) ? projectPick : "";

  return (
    <>
      <label className="block">
        <span className="label">Client *</span>
        <select
          name="clientId"
          className="input"
          value={clientId ?? ""}
          onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
          required
          disabled={disabled}
        >
          <option value="">Choose…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.code ? ` (${c.code})` : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Clients in your business units. Not listed? Add the client first.</span>
      </label>
      <div className="block">
        <label className="block">
          <span className="label">Project</span>
          <select name="projectId" className="input" value={project} onChange={(e) => setProjectPick(e.target.value)} disabled={disabled || !client}>
            <option value="">{client ? "No project" : "Pick a client first"}</option>
            {clientProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {client && <option value="__new">+ New project…</option>}
          </select>
        </label>
        {project === "__new" ? (
          <input name="newProject" className="input mt-2" placeholder="New project name, e.g. Marjan Increment" maxLength={200} required autoFocus disabled={disabled} />
        ) : (
          <span className="mt-1 block text-xs text-slate-500">The client&apos;s larger project, when several bids belong to it.</span>
        )}
      </div>
      <label className="block">
        <span className="label">Business unit *</span>
        <select
          name="businessUnitId"
          className="input"
          value={unitId ?? ""}
          onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)}
          required
          disabled={disabled || options.length <= 1}
        >
          {options.length !== 1 && <option value="">{client ? "Choose…" : "Pick a client first"}</option>}
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {/* A disabled select isn't submitted: send the single unit along */}
        {options.length === 1 && !disabled && <input type="hidden" name="businessUnitId" value={options[0].id} />}
        <span className="mt-1 block text-xs text-slate-500">
          {client && !options.length ? "This client isn't in one of your business units." : "A bid is in its client's business unit."}
        </span>
      </label>
      <label className="block">
        <span className="label">Owner *</span>
        <select name="ownerId" className="input" value={owner ?? ""} onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)} disabled={disabled || !unitId} required>
          <option value="">{unitId ? "Select…" : "Pick the client first"}</option>
          {members.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Members of the bid&apos;s business unit.</span>
      </label>
    </>
  );
}
