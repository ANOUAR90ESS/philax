import { z } from 'zod';

export const PerspectiveSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  label: z.string(),
  description: z.string(),
  assumptions: z.array(z.string()),
  values: z.array(z.string()),
  relevantDomains: z.array(z.string()),
});
export type Perspective = z.infer<typeof PerspectiveSchema>;
