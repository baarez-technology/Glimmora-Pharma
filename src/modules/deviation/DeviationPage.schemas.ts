import { z } from "zod";

export const addSchema = z.object({
  title: z.string().min(5, "Title required (min 5 chars)"),
  description: z.string().min(10, "Description required"),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(["critical", "major", "minor"]),
  area: z.string().min(1, "Area required"),
  immediateAction: z.string().min(5, "Immediate action required"),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  batchesAffected: z.string().optional(),
  raiseCAPA: z.boolean().optional(),
});
export type AddForm = z.infer<typeof addSchema>;
