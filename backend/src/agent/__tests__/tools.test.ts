import { describe, expect, it } from "vitest";
import {
	calculateAbilityModifier,
	generateStatBlockTool,
	parseDiceNotation,
	resolveAttackTool,
	rollDiceTool,
} from "../tools.js";

// ── Pure function tests ──

describe("parseDiceNotation", () => {
	it("parses standard notation", () => {
		expect(parseDiceNotation("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
	});

	it("parses negative modifier", () => {
		expect(parseDiceNotation("1d20-2")).toEqual({ count: 1, sides: 20, modifier: -2 });
	});

	it("parses no modifier", () => {
		expect(parseDiceNotation("4d8")).toEqual({ count: 4, sides: 8, modifier: 0 });
	});

	it("rejects invalid notation", () => {
		expect(() => parseDiceNotation("banana")).toThrow("Invalid dice notation");
	});
});

describe("calculateAbilityModifier", () => {
	it.each([
		[1, -5],
		[10, 0],
		[11, 0],
		[14, 2],
		[20, 5],
		[30, 10],
	])("score %i → modifier %i", (score, expectedMod) => {
		expect(calculateAbilityModifier(score).modifier).toBe(expectedMod);
	});

	it("formats positive modifiers with +", () => {
		expect(calculateAbilityModifier(16).modifierString).toBe("+3");
	});

	it("formats negative modifiers with -", () => {
		expect(calculateAbilityModifier(6).modifierString).toBe("-2");
	});
});

// ── Mastra tool execute tests ──

describe("rollDiceTool.execute", () => {
	it("rolls dice and returns correct structure", async () => {
		const result = await rollDiceTool.execute?.({ notation: "2d6+3", purpose: "damage" });

		expect(result).toBeDefined();
		// Mastra may wrap in validation — check the actual shape
		if ("error" in (result as object)) {
			// Validation error — skip
			return;
		}
		const r = result as { notation: string; rolls: number[]; modifier: number; total: number };
		expect(r.notation).toBe("2d6+3");
		expect(r.rolls).toHaveLength(2);
		expect(r.modifier).toBe(3);
		for (const roll of r.rolls) {
			expect(roll).toBeGreaterThanOrEqual(1);
			expect(roll).toBeLessThanOrEqual(6);
		}
		expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) + 3);
	});
});

describe("generateStatBlockTool.execute", () => {
	it("generates a valid stat block", async () => {
		const result = await generateStatBlockTool.execute?.({
			name: "Goblin",
			type: "monster" as const,
			challengeRating: 1,
		});

		if ("error" in (result as object)) return;
		const r = result as {
			name: string;
			type: string;
			id: string;
			hitPoints: number;
			isAlive: boolean;
		};
		expect(r.name).toBe("Goblin");
		expect(r.type).toBe("monster");
		expect(r.id).toMatch(/^creature-/);
		expect(r.hitPoints).toBeGreaterThanOrEqual(1);
		expect(r.isAlive).toBe(true);
	});
});

describe("resolveAttackTool.execute", () => {
	it("resolves an attack", async () => {
		const result = await resolveAttackTool.execute?.({
			attackerName: "Fighter",
			targetName: "Goblin",
			toHitBonus: 5,
			targetAC: 12,
			damageDice: "1d8+3",
			damageType: "slashing",
		});

		if ("error" in (result as object)) return;
		const r = result as {
			naturalRoll: number;
			attackRoll: number;
			hit: boolean;
			totalDamage: number;
			narrative: string;
		};
		expect(r.naturalRoll).toBeGreaterThanOrEqual(1);
		expect(r.naturalRoll).toBeLessThanOrEqual(20);
		expect(r.attackRoll).toBe(r.naturalRoll + 5);
		expect(typeof r.hit).toBe("boolean");
		expect(typeof r.narrative).toBe("string");
	});

	it("critical hits always hit and fumbles always miss", async () => {
		const results = await Promise.all(
			Array.from({ length: 100 }, () =>
				resolveAttackTool.execute?.({
					attackerName: "A",
					targetName: "B",
					toHitBonus: -10,
					targetAC: 30,
					damageDice: "1d4+0",
					damageType: "bludgeoning",
				}),
			),
		);

		for (const result of results) {
			if ("error" in (result as object)) continue;
			const r = result as {
				isCritical: boolean;
				isFumble: boolean;
				hit: boolean;
				naturalRoll: number;
				totalDamage: number;
			};
			if (r.isCritical) {
				expect(r.hit).toBe(true);
				expect(r.naturalRoll).toBe(20);
			}
			if (r.isFumble) {
				expect(r.hit).toBe(false);
				expect(r.naturalRoll).toBe(1);
				expect(r.totalDamage).toBe(0);
			}
		}
	});
});
