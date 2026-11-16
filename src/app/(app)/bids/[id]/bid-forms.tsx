import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { ClientUnitFields, type ClientOpt, type OwnerOpt, type ProjectOpt } from "../client-unit-fields";
import { QuotedItems, type QuotedItem } from "./quoted-items";
import type { Bid } from "@/db/schema";
import { changeBidStage, saveBidCommercial, saveBidOverview } from "@/lib/actions/bids";
import {
  BAND_LABEL,
  BID_STAGE_LABEL,
  BID_STAGES,
  BID_TYPE_LABEL,
  BID_TYPES,
  PROBABILITY_BANDS,
  SECTORS,
  SUBMISSION_MODE_LABEL,
  SUBMISSION_MODES,
  TENDER_CATEGORIES,
  TENDER_CATEGORY_LABEL,
  TYPICAL_BAND,
} from "@/lib/bids";

type Opt = { id: number; name: string };
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card p-4">
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </section>
);
const Wide = ({ children }: { children: React.ReactNode }) => <div className="sm:col-span-2">{children}</div>;
const Select = ({ name, value, options, empty = "—" }: { name: string; value: string | number | null; options: [string | number, string][]; empty?: string | null }) => (
  <select name={name} className="input" defaultValue={value ?? ""}>
    {empty !== null && <option value="">{empty}</option>}
    {options.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ))}
  </select>
);
const DateIn = ({ name, value, required }: { name: string; value: string | null; required?: boolean }) => (
  <input type="date" name={name} className="input" defaultValue={value ?? ""} required={required} />
);

/** Overview tab: references, client, opportunity and dates, as three side-by-side cards. */
export function OverviewForm({
  bid,
  canEdit,
  control,
  clients,
  endClients,
  contacts,
  users,
  projects,
  units,
}: {
  bid: Bid;
  canEdit: boolean;
  /** Owner side: may change the client, owner and project (team members can't). */
  control: boolean;
  clients: ClientOpt[];
  /** End client: any client the person can see. */
  endClients: Opt[];
  contacts: Opt[];
  users: OwnerOpt[];
  projects: ProjectOpt[];
  units: Opt[];
}) {
  return (
    <ActionForm action={saveBidOverview.bind(null, bid.id)}>
      <fieldset disabled={!canEdit} className="grid gap-4 xl:grid-cols-3">
        <Section title="Bid and client">
          <Wide>
            <Field label="Title (project name) *">
              <input name="title" className="input" defaultValue={bid.title} maxLength={200} required />
            </Field>
          </Wide>
          <ClientUnitFields clients={clients} units={units} defaultClientId={bid.clientId} defaultUnitId={bid.businessUnitId} owners={users} defaultOwnerId={bid.ownerId} projects={projects} defaultProjectId={bid.projectId} disabled={!control} />
          {control && (
            <Wide>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" name="keepPreviousOwner" className="mt-0.5" />
                When changing the owner, keep the current owner on the bid team (otherwise they lose access).
              </label>
            </Wide>
          )}
          <Field label="End client" hint="When bidding through a main contractor.">
            <Select name="endClientId" value={bid.endClientId} options={endClients.map((c) => [c.id, c.name])} />
          </Field>
          <Field label="Client contact">
            <Select name="contactId" value={bid.contactId} options={contacts.map((c) => [c.id, c.name])} />
          </Field>
          <Field label="Quotation ref.">
            <input name="quotationRef" className="input" defaultValue={bid.quotationRef ?? ""} maxLength={100} />
          </Field>
          <Field label="Client tender no.">
            <input name="clientTenderNo" className="input" defaultValue={bid.clientTenderNo ?? ""} maxLength={100} />
          </Field>
          <Field label="Client ref. no.">
            <input name="clientRefNo" className="input" defaultValue={bid.clientRefNo ?? ""} maxLength={100} />
          </Field>
        </Section>

        <Section title="Opportunity">
          <Field label="Bid type *">
            <Select name="bidType" value={bid.bidType} options={BID_TYPES.map((t) => [t, BID_TYPE_LABEL[t]])} empty={null} />
          </Field>
          <Field label="Tender category">
            <Select name="tenderCategory" value={bid.tenderCategory} options={TENDER_CATEGORIES.map((t) => [t, TENDER_CATEGORY_LABEL[t]])} />
          </Field>
          <Field label="Sector">
            <input name="sector" className="input" list="bid-sectors" defaultValue={bid.sector ?? ""} maxLength={100} />
            <datalist id="bid-sectors">
              {SECTORS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Submission mode">
            <Select name="submissionMode" value={bid.submissionMode} options={SUBMISSION_MODES.map((m) => [m, SUBMISSION_MODE_LABEL[m]])} />
          </Field>
          <Field label="Country">
            <input name="country" className="input" defaultValue={bid.country ?? ""} maxLength={100} />
          </Field>
          <Field label="Location">
            <input name="location" className="input" defaultValue={bid.location ?? ""} maxLength={100} placeholder="e.g. Jubail" />
          </Field>
          <Wide>
            <Field label="Site">
              <input name="site" className="input" defaultValue={bid.site ?? ""} maxLength={200} />
            </Field>
          </Wide>
          <Wide>
            <Field label="Scope">
              <textarea name="scope" className="input min-h-[5rem]" defaultValue={bid.scope ?? ""} />
            </Field>
          </Wide>
        </Section>

        <Section title="Dates">
          <Field label="Issue date *">
            <DateIn name="issueDate" value={bid.issueDate} required />
          </Field>
          <Field label="Acknowledged">
            <DateIn name="acknowledgedDate" value={bid.acknowledgedDate} />
          </Field>
          <Field label="Tender purchased">
            <DateIn name="tenderPurchasedDate" value={bid.tenderPurchasedDate} />
          </Field>
          <Field label="Review deadline">
            <DateIn name="reviewDeadline" value={bid.reviewDeadline} />
          </Field>
          <Field label="Clarification deadline">
            <DateIn name="clarificationDeadline" value={bid.clarificationDeadline} />
          </Field>
          <Field label="Closing date *">
            <DateIn name="closingDate" value={bid.closingDate} required />
          </Field>
          <Field label="Expected award">
            <DateIn name="expectedAwardDate" value={bid.expectedAwardDate} />
          </Field>
          <Field label="Expected start">
            <DateIn name="expectedStartDate" value={bid.expectedStartDate} />
          </Field>
          <Wide>
            <Field label="Notes">
              <textarea name="notes" className="input min-h-[4rem]" defaultValue={bid.notes ?? ""} />
            </Field>
          </Wide>
        </Section>
      </fieldset>
      {canEdit && (
        <div className="mt-4">
          <SubmitButton>Save overview</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

const Money = ({ name, label, value }: { name: string; label: string; value: number | null }) => (
  <Field label={label}>
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
      <input name={name} className="input pl-7 tabular-nums" inputMode="decimal" defaultValue={value ?? ""} />
    </div>
  </Field>
);
const Whole = ({ name, label, value, hint }: { name: string; label: string; value: number | null; hint?: string }) => (
  <Field label={label} hint={hint}>
    <input name={name} className="input tabular-nums" inputMode="numeric" defaultValue={value ?? ""} />
  </Field>
);
const Text = ({ name, label, value }: { name: string; label: string; value: string | null }) => (
  <Field label={label}>
    <textarea name={name} className="input min-h-[4rem]" defaultValue={value ?? ""} />
  </Field>
);

/** Commercial tab: value and manpower, then terms, then risks. All amounts in USD, excluding VAT. */
export function CommercialForm({ bid, canEdit, items }: { bid: Bid; canEdit: boolean; items: QuotedItem[] }) {
  return (
    <ActionForm action={saveBidCommercial.bind(null, bid.id)}>
      <fieldset disabled={!canEdit} className="grid gap-4 xl:grid-cols-3">
        <Section title="Value and manpower (USD)">
          <Money name="bidValue" label="Bid value (excl. VAT)" value={bid.bidValue} />
          <Money name="monthlyBilling" label="Monthly billing" value={bid.monthlyBilling} />
          <Whole name="manpowerEstimate" label="Manpower (heads)" value={bid.manpowerEstimate} />
          <Money name="profitPerHead" label="Profit per head" value={bid.profitPerHead} />
          <Whole name="durationMonths" label="Duration (months)" value={bid.durationMonths} />
          <Whole name="optionMonths" label="Option (months)" value={bid.optionMonths} hint="Extension the client may take up." />
        </Section>
        <Section title="Terms">
          <Field label="Retention %">
            <input name="retentionPct" className="input tabular-nums" inputMode="decimal" defaultValue={bid.retentionPct ?? ""} />
          </Field>
          <Field label="Advance payment">
            <input name="advancePayment" className="input" defaultValue={bid.advancePayment ?? ""} maxLength={200} placeholder="e.g. 10% against APG" />
          </Field>
          <Wide>
            <Text name="paymentTerms" label="Payment terms" value={bid.paymentTerms} />
          </Wide>
          <Wide>
            <Text name="invoicingSchedule" label="Invoicing schedule" value={bid.invoicingSchedule} />
          </Wide>
        </Section>
        <Section title="Insurance, penalties and risks">
          <Wide>
            <Text name="insuranceTerms" label="Insurance" value={bid.insuranceTerms} />
          </Wide>
          <Wide>
            <Text name="penaltyTerms" label="Penalty clause" value={bid.penaltyTerms} />
          </Wide>
          <Wide>
            <Text name="risks" label="Risk factors" value={bid.risks} />
          </Wide>
        </Section>
        <QuotedItems items={items} disabled={!canEdit} />
      </fieldset>
      {canEdit && (
        <div className="mt-4">
          <SubmitButton>Save commercial</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

/** Stage, probability band, submission date and (when closing) the reason. */
export function StageForm({ bid, canEdit }: { bid: Bid; canEdit: boolean }) {
  const typical = TYPICAL_BAND[bid.stage];
  return (
    <ActionForm action={changeBidStage.bind(null, bid.id)} className="card p-4">
      <h3 className="mb-3 font-semibold text-navy">Stage and probability</h3>
      <fieldset disabled={!canEdit} className="space-y-3">
        <Field label="Stage">
          <Select name="stage" value={bid.stage} options={BID_STAGES.map((s) => [s, BID_STAGE_LABEL[s]])} empty={null} />
        </Field>
        <Field label="Probability" hint={typical ? `Typical at ${BID_STAGE_LABEL[bid.stage]}: ${BAND_LABEL[typical]}. Won sets 100%.` : "Won sets 100%."}>
          <Select name="probabilityBand" value={bid.probabilityBand} options={PROBABILITY_BANDS.map((p) => [p, BAND_LABEL[p]])} empty="Not set" />
        </Field>
        <Field label="Submission date" hint="Needed from Submitted on, with the bid value.">
          <DateIn name="submittedDate" value={bid.submittedDate} />
        </Field>
        <Field label="Reason" hint="Needed for Lost, Cancelled and Not submitted / Declined.">
          <textarea name="closedReason" className="input min-h-[3.5rem]" defaultValue={bid.closedReason ?? ""} />
        </Field>
      </fieldset>
      {canEdit && (
        <div className="mt-3">
          <SubmitButton>Update</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
