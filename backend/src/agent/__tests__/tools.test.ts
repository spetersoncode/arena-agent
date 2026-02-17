import { describe, expect, it } from "vitest";
import {
	applyKeepDrop,
	calculateAbilityModifier,
	generateStatBlockTool,
	parseDiceNotation,
	resolveAttackTool,
	rollDiceTool,
} from "../tools.js";

// ── Pure function tests ──

describe("parseDiceNotation", () => {
	it("parses standard notation", () => {
		expect(parseDiceNotation("2d6+3")).toEqual({
			count: 2,
			sides: 6,
			keepDrop: null,
			modifier: 3,
		});
	});

	it("parses negative modifier", () => {
		expect(parseDiceNotation("1d20-2")).toEqual({
			count: 1,
			sides: 20,
			keepDrop: null,
			modifier: -2,
		});
	});

	it("parses no modifier", () => {
		expect(parseDiceNotation("4d8")).toEqual({
			count: 4,
			sides: 8,
			keepDrop: null,
			modifier: 0,
		});
	});

	it("parses keep highest (advantage)", () => {
		expect(parseDiceNotation("2d20kh1+5")).toEqual({
			count: 2,
			sides: 20,
			keepDrop: { type: "kh", n: 1 },
			modifier: 5,
		});
	});

	it("parses keep lowest (disadvantage)", () => {
		expect(parseDiceNotation("2d20kl1")).toEqual({
			count: 2,
			sides: 20,
			keepDrop: { type: "kl", n: 1 },
			modifier: 0,
		});
	});

	it("parses drop lowest (stat rolling)", () => {
		expect(parseDiceNotation("4d6dl1")).toEqual({
			count: 4,
			sides: 6,
			keepDrop: { type: "dl", n: 1 },
			modifier: 0,
		});
	});

	it("parses drop highest", () => {
		expect(parseDiceNotation("4d6dh1-2")).toEqual({
			count: 4,
			sides: 6,
			keepDrop: { type: "dh", n: 1 },
			modifier: -2,
		});
	});

	it("rejects invalid notation", () => {
		expect(() => parseDiceNotation("banana")).toThrow("Invalid dice notation");
	});
});

describe("applyKeepDrop", () => {
	it("returns all rolls when no keep/drop", () => {
		expect(applyKeepDrop([3, 1, 4], null)).toEqual([3, 1, 4]);
	});

	it("keeps highest n", () => {
		expect(applyKeepDrop([3, 1, 5, 2], { type: "kh", n: 2 })).toEqual([3, 5]);
	});

	it("keeps lowest n", () => {
		expect(applyKeepDrop([3, 1, 5, 2], { type: "kl", n: 2 })).toEqual([1, 2]);
	});

	it("drops lowest n", () => {
		expect(applyKeepDrop([3, 1, 5, 2], { type: "dl", n: 1 })).toEqual([2, 3, 5]);
	});

	it("drops highest n", () => {
		expect(applyKeepDrop([3, 1, 5, 2], { type: "dh", n: 1 })).toEqual([1, 2, 3]);
	});

	it("keeps highest 1 for advantage", () => {
		expect(applyKeepDrop([8, 15], { type: "kh", n: 1 })).toEqual([15]);
	});

	it("keeps lowest 1 for disadvantage", () => {
		expect(applyKeepDrop([8, 15], { type: "kl", n: 1 })).toEqual([8]);
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
		if ("error" in (result as object)) return;
		const r = result as {
			notation: string;
			rolls: number[];
			kept: number[];
			modifier: number;
			total: number;
		};
		expect(r.notation).toBe("2d6+3");
		expect(r.rolls).toHaveLength(2);
		expect(r.kept).toHaveLength(2); // no keep/drop, all kept
		expect(r.modifier).toBe(3);
		for (const roll of r.rolls) {
			expect(roll).toBeGreaterThanOrEqual(1);
			expect(roll).toBeLessThanOrEqual(6);
		}
		expect(r.total).toBe(r.kept.reduce((a, b) => a + b, 0) + 3);
	});

	it("handles advantage notation (2d20kh1)", async () => {
		const result = await rollDiceTool.execute?.({
			notation: "2d20kh1+5",
			purpose: "attack with advantage",
		});

		expect(result).toBeDefined();
		if ("error" in (result as object)) return;
		const r = result as {
			rolls: number[];
			kept: number[];
			modifier: number;
			total: number;
		};
		expect(r.rolls).toHaveLength(2);
		expect(r.kept).toHaveLength(1);
		expect(r.kept[0]).toBe(Math.max(...r.rolls));
		expect(r.total).toBe(r.kept[0] + 5);
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
