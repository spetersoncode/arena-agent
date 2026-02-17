import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware.js";
import { roleSchema } from "../schemas/index.js";

const adminRoutes = new Hono()
	// ── List all users (admin only) ──
	.get("/users", requireAuth, requireRole("admin"), async (c) => {
		const users = await db.select().from(schema.users);
		return c.json({
			success: true,
			data: users.map((u) => ({
				id: u.id,
				name: u.name,
				email: u.email,
				image: u.image,
				role: u.role,
				createdAt: u.createdAt,
			})),
		});
	})

	// ── Update user role (admin only) ──
	.patch(
		"/users/:id/role",
		requireAuth,
		requireRole("admin"),
		zValidator(
			"json",
			z.object({
				role: roleSchema,
			}),
		),
		async (c) => {
			const userId = c.req.param("id");
			const { role } = c.req.valid("json");

			const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();

			if (!user) {
				return c.json({ success: false, error: "User not found" }, 404);
			}

			await db
				.update(schema.users)
				.set({ role, updatedAt: new Date() })
				.where(eq(schema.users.id, userId));

			return c.json({ success: true, data: { id: userId, role } });
		},
	)

	// ── Get system stats (admin only) ──
	.get("/stats", requireAuth, requireRole("admin"), async (c) => {
		const users = await db.select().from(schema.users);
		const arenas = await db.select().from(schema.arenas);

		return c.json({
			success: true,
			data: {
				totalUsers: users.length,
				totalArenas: arenas.length,
				activeArenas: arenas.filter((a) => a.status === "active").length,
				usersByRole: {
					admin: users.filter((u) => u.role === "admin").length,
					player: users.filter((u) => u.role === "player").length,
					spectator: users.filter((u) => u.role === "spectator").length,
				},
			},
		});
	});

export { adminRoutes };
