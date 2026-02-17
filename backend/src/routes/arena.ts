import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { arenaMasterAgent } from "../agent/index.js";
import { db, schema } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware.js";
import { createArenaRequestSchema } from "../schemas/index.js";

const arenaRoutes = new Hono()
	// ── List arenas (any authenticated user) ──
	.get("/", requireAuth, async (c) => {
		const user = c.get("user");
		const userRole = (user as { role?: string }).role;

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

	// ── Create arena (player+) — fast, no agent call ──
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
				name: message.slice(0, 100),
				description: message,
				status: "setup",
				combatants: "[]",
				log: "[]",
				createdBy: user.id,
				createdAt: now,
				updatedAt: now,
			});

			return c.json({
				success: true,
				data: { arenaId },
			});
		},
	)

	// ── Run full combat via SSE stream (player+) ──
	.get("/:id/run", requireAuth, requireRole("player"), async (c) => {
		const user = c.get("user");
		const arenaId = c.req.param("id");

		const arena = await db.select().from(schema.arenas).where(eq(schema.arenas.id, arenaId)).get();

		if (!arena) {
			return c.json({ success: false, error: "Arena not found" }, 404);
		}

		if (arena.createdBy !== user.id && (user as { role?: string }).role !== "admin") {
			return c.json({ success: false, error: "Forbidden" }, 403);
		}

		// Check if combat already ran
		const existingMessages = await db
			.select()
			.from(schema.chatMessages)
			.where(eq(schema.chatMessages.arenaId, arenaId))
			.limit(1);

		if (existingMessages.length > 0) {
			return c.json({ success: false, error: "Combat already ran for this arena" }, 400);
		}

		const scenario = arena.description || arena.name;

		const prompt = `Run a complete D&D 5e combat encounter for this scenario: "${scenario}"

Do the following in order:
1. Generate stat blocks for all combatants using the generate-stat-block tool
2. Roll initiative for each combatant using the roll-dice tool
3. Announce the initiative order
4. Run combat round by round until one side is eliminated:
   - For each combatant's turn, choose a tactically appropriate action
   - Use the resolve-attack tool for all attacks
   - Track HP changes after each action
   - Provide a brief status summary after each round
5. Declare the winner and give a final battle summary

Run the ENTIRE combat to completion. Do not stop and ask for input. Be dramatic but keep the pace moving.`;

		return streamSSE(c, async (stream) => {
			let eventId = 0;

			// Mark arena as active
			await db
				.update(schema.arenas)
				.set({ status: "active", updatedAt: new Date() })
				.where(eq(schema.arenas.id, arenaId));

			await stream.writeSSE({
				data: JSON.stringify({ type: "status", status: "active" }),
				event: "status",
				id: String(eventId++),
			});

			try {
				// Default maxSteps is 5 — far too few for a full combat.
				// A typical fight needs ~3 stat blocks + 3 initiative rolls + 3-5 attacks/round × 5-10 rounds = 30-60 tool calls.
				const result = await arenaMasterAgent.stream(prompt, { maxSteps: 100 });
				let fullText = "";

				const reader = result.fullStream.getReader();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					if (value.type === "text-delta") {
						const text = value.payload.delta;
						fullText += text;
						await stream.writeSSE({
							data: JSON.stringify({ type: "chunk", text }),
							event: "chunk",
							id: String(eventId++),
						});
					} else if (value.type === "tool-result") {
						const { toolName, result: toolResult } = value.payload;
						await stream.writeSSE({
							data: JSON.stringify({ type: "tool-result", toolName, result: toolResult }),
							event: "tool-result",
							id: String(eventId++),
						});
					}
				}

				// Save the full combat log as a single assistant message
				await db.insert(schema.chatMessages).values({
					id: nanoid(),
					arenaId,
					userId: user.id,
					role: "assistant",
					content: fullText,
					createdAt: new Date(),
				});

				// Mark arena completed
				await db
					.update(schema.arenas)
					.set({ status: "completed", updatedAt: new Date() })
					.where(eq(schema.arenas.id, arenaId));

				await stream.writeSSE({
					data: JSON.stringify({ type: "status", status: "completed" }),
					event: "status",
					id: String(eventId++),
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown error";
				console.error("Combat stream error:", err);

				await stream.writeSSE({
					data: JSON.stringify({ type: "error", error: errorMessage }),
					event: "error",
					id: String(eventId++),
				});

				// Mark arena as failed/setup so it can be retried
				await db
					.update(schema.arenas)
					.set({ status: "setup", updatedAt: new Date() })
					.where(eq(schema.arenas.id, arenaId));
			}
		});
	})

	// ── Get combat log for an arena ──
	.get("/:id/messages", requireAuth, async (c) => {
		const user = c.get("user");
		const arenaId = c.req.param("id");

		const arena = await db.select().from(schema.arenas).where(eq(schema.arenas.id, arenaId)).get();

		if (!arena) {
			return c.json({ success: false, error: "Arena not found" }, 404);
		}

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
