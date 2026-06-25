import { z } from "zod";

export const compactPartIdSchema = z.string().regex(/^[a-z0-9]{26}$/, "expected 26-character PartsBox compact ID");

export const selectedPartSchema = z.object({
  partId: compactPartIdSchema,
  sourceUrl: z.string().url().optional()
});

export const labelRecordSchema = selectedPartSchema.extend({
  pn: z.string().trim().min(1),
  description: z.string().trim().min(1)
});

export const selectedPartsRequestSchema = z.array(selectedPartSchema).min(1);
export const labelRecordsRequestSchema = z.array(labelRecordSchema).min(1);

export type SelectedPart = z.infer<typeof selectedPartSchema>;
export type LabelRecord = z.infer<typeof labelRecordSchema>;
