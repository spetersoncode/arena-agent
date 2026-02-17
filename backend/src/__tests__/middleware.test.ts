import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireRole } from "../middleware.js";

// Mock auth middleware by directly setting user on context
function mockAuthUser(role: string) {
	return new Hono().use("*", async (c, next) => {
		c.set("user", { id: "test-user", name: "Test", email: "test@test.com", role });
		c.set("session", { id: "test-session" });
		await next();
	});
}

describe("requireRole", () => {
	it("allows admin to access admin routes", async () => {
		const app = mockAuthUser("admin").get("/admin", requireRole("admin"), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/admin");
		expect(res.status).toBe(200);
	});

	it("blocks player from admin routes", async () => {
		const app = mockAuthUser("player").get("/admin", requireRole("admin"), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/admin");
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toContain("admin");
	});

	it("blocks spectator from player routes", async () => {
		const app = mockAuthUser("spectator").get("/play", requireRole("player"), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/play");
		expect(res.status).toBe(403);
	});

	it("allows admin to access player routes (hierarchy)", async () => {
		const app = mockAuthUser("admin").get("/play", requireRole("player"), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/play");
		expect(res.status).toBe(200);
	});

	it("allows player to access spectator routes (hierarchy)", async () => {
		const app = mockAuthUser("player").get("/view", requireRole("spectator"), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/view");
		expect(res.status).toBe(200);
	});
});
