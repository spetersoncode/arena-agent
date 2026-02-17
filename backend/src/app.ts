import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireAuth } from "./middleware.js";
import { adminRoutes } from "./routes/admin.js";
import { arenaRoutes } from "./routes/arena.js";
import { authRoutes } from "./routes/auth.js";

const app = new Hono()
	.use(logger())
	.use(
		"/api/*",
		cors({
			origin: process.env.FRONTEND_URL || "http://localhost:5173",
			credentials: true,
		}),
	)

	// Better Auth — handles /api/auth/*
	.route("/api/auth", authRoutes)

	// Current user info (any authenticated user)
	.get("/api/me", requireAuth, async (c) => {
		const user = c.get("user");
		return c.json({ success: true, data: user });
	})

	// Arena routes — /api/arenas/*
	.route("/api/arenas", arenaRoutes)

	// Admin routes — /api/admin/*
	.route("/api/admin", adminRoutes);

// ── Export the type for Hono RPC client ──
export type AppType = typeof app;

export { app };
