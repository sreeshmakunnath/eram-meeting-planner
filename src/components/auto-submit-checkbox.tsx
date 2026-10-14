"use client";
/** A checkbox that submits its form when ticked or unticked (used by task checklists). */
export function AutoSubmitCheckbox({ checked, disabled, label }: { checked: boolean; disabled?: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-4 w-4 accent-brand"
    />
  );
}
