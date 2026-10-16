import { z } from "zod";

const envSchema = z.object({
  IG_APP_ID: z.string().min(1),
  IG_APP_SECRET: z.string().min(1),
  IG_VERIFY_TOKEN: z.string().min(1),
  IG_OAUTH_REDIRECT_URI: z.string().min(1),
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLOSE_API_KEY: z.string().min(1),
  CLOSE_LEAD_OWNER_ID: z.string().min(1),
});

export const config = envSchema.parse(process.env);
export type AppConfig = z.infer<typeof envSchema>;
