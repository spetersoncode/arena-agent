import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { arenaMasterAgent } from "../agent/index.js";
import { db, schema } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware.js";
import { chatRequestSchema, createArenaRequestSchema } from "../schemas/index.js";

const arenaRoutes = new Hono()
	// ── List arenas (any authenticated user) ──
	.get("/", requireAuth, async (c) => {
		const user = c.get("user");
		const userRole = (user as { role?: string }).role;

		// Admins see all arenas, others see only their own
		const arenas =
			userRole === "admin"
				? await db.select().from(schema.arenas).orderBy(desc(schema.arenas.createdAt)).limit(50)
				: await db
						.select()
						.from(schema.arenas)
						.where(eq(schema.arenas.createdBy, user.id))
						.orderBy(desc(schema.arenas.createdAt))
						.limit(50);

		return c.json({
			success: true,
			data: arenas.map((a) => ({
				...a,
				combatants: JSON.parse(a.combatants),
				log: JSON.parse(a.log),
			})),
		});
	})

	// ── Get single arena ──
	.get("/:id", requireAuth, async (c) => {
		const arena = await db
			.select()
			.from(schema.arenas)
			.where(eq(schema.arenas.id, c.req.param("id")))
			.get();

		if (!arena) {
			return c.json({ success: false, error: "Arena not found" }, 404);
		}

		// Spectators and players can only see their own (unless admin)
		const user = c.get("user");
		const userRole = (user as { role?: string }).role;
		if (userRole !== "admin" && arena.createdBy !== user.id) {
			return c.json({ success: false, error: "Forbidden" }, 403);
		}

		return c.json({
			success: true,
			data: {
				...arena,
				combatants: JSON.parse(arena.combatants),
				log: JSON.parse(arena.log),
			},
		});
	})

	// ── Create arena via chat (player+) ──
	.post(
		"/",
		requireAuth,
		requireRole("player"),
		zValidator("json", createArenaRequestSchema),
		async (c) => {
			const user = c.get("user");
			const { message } = c.req.valid("json");
			const arenaId = nanoid();
			const now = new Date();

			await db.insert(schema.arenas).values({
				id: arenaId,
				name: "New Arena",
				status: "setup",
				combatants: "[]",
				log: "[]",
				createdBy: user.id,
				createdAt: now,
				updatedAt: now,
			});

			// Save the user's message
			await db.insert(schema.chatMessages).values({
				id: nanoid(),
				arenaId,
				userId: user.id,
				role: "user",
				content: message,
				createdAt: now,
			});

			// Ask the agent to set up the scenario
			const result = await arenaMasterAgent.generate(
				`Set up this combat scenario: ${message}\n\nCreate stat blocks for all combatants, roll initiative, and prepare for combat. Respond with a vivid description of the arena and combatants.`,
			);

			const assistantMessage = result.text;

			// Save the assistant's response
			await db.insert(schema.chatMessages).values({
				id: nanoid(),
				arenaId,
				userId: user.id,
				role: "assistant",
				content: assistantMessage,
				createdAt: new Date(),
			});

			// Update arena status
			await db
				.update(schema.arenas)
				.set({ status: "active", updatedAt: new Date() })
				.where(eq(schema.arenas.id, arenaId));

			return c.json({
				success: true,
				data: { arenaId, message: assistantMessage },
			});
		},
	)

	// ── Chat with arena agent (player+) ──
	.post(
		"/:id/chat",
		requireAuth,
		requireRole("player"),
		zValidator("json", chatRequestSchema),
		async (c) => {
			const user = c.get("user");
			const arenaId = c.req.param("id");
			const { message } = c.req.valid("json");

			const arena = await db
				.select()
				.from(schema.arenas)
				.where(eq(schema.arenas.id, arenaId))
				.get();

			if (!arena) {
				return c.json({ success: false, error: "Arena not found" }, 404);
			}

			if (arena.createdBy !== user.id && (user as { role?: string }).role !== "admin") {
				return c.json({ success: false, error: "Forbidden" }, 403);
			}

			// Save user message
			await db.insert(schema.chatMessages).values({
				id: nanoid(),
				arenaId,
				userId: user.id,
				role: "user",
				content: message,
				createdAt: new Date(),
			});

			// Get chat history for context
			const history = await db
				.select()
				.from(schema.chatMessages)
				.where(eq(schema.chatMessages.arenaId, arenaId))
				.orderBy(schema.chatMessages.createdAt)
				.limit(50);

			// Build context from history
			const historyText = history
				.map((m) => `${m.role === "user" ? "Player" : "Arena Master"}: ${m.content}`)
				.join("\n\n");

			const stateContext = `[Current arena state: ${arena.status}, Round ${arena.round}, Combatants: ${arena.combatants}]`;
			const fullPrompt = `${historyText}\n\n${stateContext}\n\nPlayer: ${message}`;

			const result = await arenaMasterAgent.generate(fullPrompt);
			const assistantMessage = result.text;

			// Save assistant response
			await db.insert(schema.chatMessages).values({
				id: nanoid(),
				arenaId,
				userId: user.id,
				role: "assistant",
				content: assistantMessage,
				createdAt: new Date(),
			});

			return c.json({
				success: true,
				data: { message: assistantMessage },
			});
		},
	)

	// ── Get chat history for an arena ──
	.get("/:id/messages", requireAuth, async (c) => {
		const user = c.get("user");
		const arenaId = c.req.param("id");

		const arena = await db.select().from(schema.arenas).where(eq(schema.arenas.id, arenaId)).get();

		if (!arena) {
			return c.json({ success: false, error: "Arena not found" }, 404);
		}

		// Spectators can view any arena's messages (read-only), players own, admins all
		const userRole = (user as { role?: string }).role;
		if (userRole === "player" && arena.createdBy !== user.id) {
			return c.json({ success: false, error: "Forbidden" }, 403);
		}

		const messages = await db
			.select()
			.from(schema.chatMessages)
			.where(eq(schema.chatMessages.arenaId, arenaId))
			.orderBy(schema.chatMessages.createdAt);

		return c.json({ success: true, data: messages });
	})

	// ── Delete arena (admin only) ──
	.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
		const arenaId = c.req.param("id");
		await db.delete(schema.chatMessages).where(eq(schema.chatMessages.arenaId, arenaId));
		await db.delete(schema.arenas).where(eq(schema.arenas.id, arenaId));
		return c.json({ success: true });
	});

export { arenaRoutes };
