import { z } from "zod";

export const supplierSchema = z.object({
    supplierName: z.string().trim().min(1, "Supplier name is required"),
    supplierPhone: z.string().trim().min(5, "Supplier phone is required"),
    supplierAddress: z.string().optional(),
});

export type SupplierFormInput = z.input<typeof supplierSchema>;
export type SupplierFormValues = z.output<typeof supplierSchema>;
