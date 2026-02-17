import { describe, expect, it } from "vitest";
import {
	abilityScoresSchema,
	chatRequestSchema,
	createArenaRequestSchema,
	roleSchema,
} from "../index.js";

describe("abilityScoresSchema", () => {
	it("accepts valid scores", () => {
		const result = abilityScoresSchema.safeParse({
			strength: 16,
			dexterity: 14,
			constitution: 12,
			intelligence: 10,
			wisdom: 8,
			charisma: 15,
		});
		expect(result.success).toBe(true);
	});

	it("rejects scores below 1", () => {
		const result = abilityScoresSchema.safeParse({
			strength: 0,
			dexterity: 14,
			constitution: 12,
			intelligence: 10,
			wisdom: 8,
			charisma: 15,
		});
		expect(result.success).toBe(false);
	});

	it("rejects scores above 30", () => {
		const result = abilityScoresSchema.safeParse({
			strength: 31,
			dexterity: 14,
			constitution: 12,
			intelligence: 10,
			wisdom: 8,
			charisma: 15,
		});
		expect(result.success).toBe(false);
	});
});

describe("roleSchema", () => {
	it.each(["admin", "player", "spectator"])("accepts '%s'", (role) => {
		expect(roleSchema.safeParse(role).success).toBe(true);
	});

	it("rejects invalid roles", () => {
		expect(roleSchema.safeParse("superadmin").success).toBe(false);
	});
});

describe("createArenaRequestSchema", () => {
	it("accepts valid message", () => {
		const result = createArenaRequestSchema.safeParse({
			message: "3 goblins vs a paladin",
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty message", () => {
		const result = createArenaRequestSchema.safeParse({ message: "" });
		expect(result.success).toBe(false);
	});

	it("rejects message over 2000 chars", () => {
		const result = createArenaRequestSchema.safeParse({
			message: "a".repeat(2001),
		});
		expect(result.success).toBe(false);
	});
});

describe("chatRequestSchema", () => {
	it("accepts valid message", () => {
		const result = chatRequestSchema.safeParse({ message: "next round" });
		expect(result.success).toBe(true);
	});
});
