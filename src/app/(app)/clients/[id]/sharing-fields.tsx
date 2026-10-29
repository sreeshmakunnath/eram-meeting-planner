import { CheckboxList } from "@/components/checkbox-list";

export type Visibility = "private" | "selected" | "everyone";

/**
 * Who sees a contact: private, selected people, or everyone who can see the client. The people list shows only
 * while "Selected people" is ticked (CSS only, no script). `people` are those who can see the client.
 */
export function SharingFields({
  visibility,
  selected = [],
  people,
}: {
  visibility: Visibility;
  selected?: number[];
  people: { id: number; fullName: string }[];
}) {
  const option = (v: Visibility, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="radio" name="visibility" value={v} defaultChecked={visibility === v} className="mt-0.5 accent-brand" />
      <span>
        {label}
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="group space-y-2">
      {option("private", "Private", "You, the client's account owner and Super Admins.")}
      {option("selected", "Selected people", "Also the people you tick below.")}
      <div className="hidden pl-6 group-has-[input[value=selected]:checked]:block">
        <CheckboxList
          name="shareUserIds"
          options={people.map((p) => ({ id: p.id, label: p.fullName }))}
          selected={selected}
          empty="Nobody else can see this client yet."
        />
        <p className="mt-1 text-xs text-slate-500">Only people who can see this client are listed.</p>
      </div>
      {option("everyone", "Everyone who can see this client", "Shared with the whole team on this client.")}
    </div>
  );
}
