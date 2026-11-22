"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { runVendorImport, type VendorImportResult } from "@/lib/vendor-import";

/** Vendor registration import from the upload form. Admins only. */
export async function importVendorRegistrations(_: VendorImportResult | undefined, fd: FormData): Promise<VendorImportResult> {
  const admin = await requireAdmin();
  const file = fd.get("file");
  const result = await runVendorImport(admin, file instanceof File ? file : null, fd.get("intent") !== "import");
  if (!result.error && !result.checkOnly) revalidatePath("/reports/vendor-registrations");
  return result;
}
