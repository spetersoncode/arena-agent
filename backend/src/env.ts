import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().default("file:local.db"),
	DATABASE_AUTH_TOKEN: z.string().optional(),
	BETTER_AUTH_SECRET: z.string(),
	BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
	GOOGLE_CLIENT_ID: z.string(),
	GOOGLE_CLIENT_SECRET: z.string(),
	GOOGLE_VERTEX_PROJECT: z.string(),
	GOOGLE_VERTEX_LOCATION: z.string().default("us-central1"),
	PORT: z.coerce.number().default(3000),
	FRONTEND_URL: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
	return envSchema.parse(process.env);
}
