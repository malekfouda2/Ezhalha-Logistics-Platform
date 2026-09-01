import { z } from "zod";

export const customsItemSchema = z.object({
    itemName: z.string().trim().min(1, "Item name is required"),
    category: z.string().trim().min(1, "Category is required"),
    countryOfOrigin: z.string().trim().min(1, "Country of origin is required"),
    price: z.number().gt(0, "Unit price must be greater than 0"),
    currency: z.string().trim().min(1, "Currency is required"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    itemDescription: z.string().optional(),
    material: z.string().optional(),
    hsCode: z.string().optional(),
});

export type CustomsItemFormValues = z.infer<typeof customsItemSchema>;
