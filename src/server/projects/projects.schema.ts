import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().transform((s) => s.trim()).pipe(z.string().min(1, "Name erforderlich")),
  address: z.string().trim().optional(),
  projectNo: z.string().trim().optional(),
});

export type CreateProjectValues = z.infer<typeof createProjectSchema>;
