import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Roll dice in D&D notation. Supports:
 * - Basic: "2d6+3", "1d20", "4d8-1"
 * - Keep highest: "2d20kh1+5" (advantage)
 * - Keep lowest: "2d20kl1+5" (disadvantage)
 * - Drop lowest: "4d6dl1" (stat rolling)
 * - Drop highest: "4d6dh1"
 */
export const rollDiceTool = createTool({
	id: "roll-dice",
	description:
		"Roll dice using D&D notation. Supports basic ('2d6+3', '1d20'), advantage/disadvantage ('2d20kh1+5', '2d20kl1'), and drop ('4d6dl1'). Returns individual rolls, kept rolls, and total.",
	inputSchema: z.object({
		notation: z
			.string()
			.describe(
				"Dice notation, e.g. '2d6+3', '1d20', '2d20kh1+5' (advantage), '2d20kl1' (disadvantage), '4d6dl1' (drop lowest)",
			),
		purpose: z.string().optional().describe("What the roll is for, e.g. 'attack roll', 'damage'"),
	}),
	outputSchema: z.object({
		notation: z.string(),
		rolls: z.array(z.number()),
		kept: z.array(z.number()),
		modifier: z.number(),
		total: z.number(),
		purpose: z.string().optional(),
	}),
	execute: async (input) => {
		const { notation, purpose } = input;
		const parsed = parseDiceNotation(notation);

		const rolls: number[] = [];
		for (let i = 0; i < parsed.count; i++) {
			rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
		}

		const kept = applyKeepDrop(rolls, parsed.keepDrop);
		const total = kept.reduce((a, b) => a + b, 0) + parsed.modifier;

		return { notation, rolls, kept, modifier: parsed.modifier, total, purpose };
	},
});

/**
 * Calculate ability score modifier from a score.
 */
export const abilityModifierTool = createTool({
	id: "ability-modifier",
	description: "Calculate the D&D 5e ability modifier for a given ability score.",
	inputSchema: z.object({
		score: z.number().min(1).max(30).describe("The ability score (1-30)"),
	}),
	outputSchema: z.object({
		score: z.number(),
		modifier: z.number(),
		modifierString: z.string(),
	}),
	execute: async (input) => {
		const { score } = input;
		const modifier = Math.floor((score - 10) / 2);
		const modifierString = modifier >= 0 ? `+${modifier}` : `${modifier}`;
		return { score, modifier, modifierString };
	},
});

/**
 * Generate a D&D 5e stat block for a creature.
 */
export const generateStatBlockTool = createTool({
	id: "generate-stat-block",
	description:
		"Generate a D&D 5e stat block for a creature. Returns a complete stat block with ability scores, HP, AC, and attacks.",
	inputSchema: z.object({
		name: z.string().describe("Creature name"),
		type: z.enum(["player", "monster", "npc"]).describe("Creature type"),
		challengeRating: z.number().optional().describe("Desired challenge rating (0-30)"),
		description: z.string().optional().describe("Brief description to guide stat generation"),
	}),
	outputSchema: z.object({
		id: z.string(),
		name: z.string(),
		type: z.enum(["player", "monster", "npc"]),
		armorClass: z.number(),
		hitPoints: z.number(),
		maxHitPoints: z.number(),
		abilityScores: z.object({
			strength: z.number(),
			dexterity: z.number(),
			constitution: z.number(),
			intelligence: z.number(),
			wisdom: z.number(),
			charisma: z.number(),
		}),
		attacks: z.array(
			z.object({
				name: z.string(),
				toHitBonus: z.number(),
				damageDice: z.string(),
				damageType: z.string(),
			}),
		),
		conditions: z.array(z.string()),
		isAlive: z.boolean(),
	}),
	execute: async (input) => {
		const { name, type, challengeRating = 1 } = input;
		const cr = Math.max(0, Math.min(30, challengeRating));

		// Scale stats roughly with CR
		const baseScore = Math.min(10 + cr, 30);
		const hp = Math.max(1, Math.floor(10 + cr * 15 + Math.random() * 10));
		const ac = Math.min(10 + Math.floor(cr * 0.8) + Math.floor(Math.random() * 3), 25);
		const profBonus = Math.floor((cr - 1) / 4) + 2;

		const id = `creature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		const strength = Math.min(baseScore + Math.floor(Math.random() * 4) - 2, 30);
		const dexterity = Math.min(baseScore + Math.floor(Math.random() * 4) - 2, 30);
		const constitution = Math.min(baseScore + Math.floor(Math.random() * 4) - 2, 30);
		const intelligence = Math.min(8 + Math.floor(Math.random() * 6), 30);
		const wisdom = Math.min(8 + Math.floor(Math.random() * 6), 30);
		const charisma = Math.min(8 + Math.floor(Math.random() * 6), 30);

		const strMod = Math.floor((strength - 10) / 2);
		const damageDice =
			cr <= 1 ? "1d6" : cr <= 4 ? "1d8" : cr <= 10 ? "2d6" : cr <= 16 ? "2d8" : "3d6";

		return {
			id,
			name,
			type,
			armorClass: ac,
			hitPoints: hp,
			maxHitPoints: hp,
			abilityScores: { strength, dexterity, constitution, intelligence, wisdom, charisma },
			attacks: [
				{
					name: type === "monster" ? "Claw" : "Longsword",
					toHitBonus: strMod + profBonus,
					damageDice: `${damageDice}+${strMod}`,
					damageType: "slashing",
				},
			],
			conditions: [],
			isAlive: true,
		};
	},
});

/**
 * Resolve an attack between two combatants.
 */
export const resolveAttackTool = createTool({
	id: "resolve-attack",
	description:
		"Resolve a D&D 5e attack. Rolls to hit against target AC, then rolls damage if it hits. Handles critical hits (nat 20) and misses (nat 1).",
	inputSchema: z.object({
		attackerName: z.string(),
		targetName: z.string(),
		toHitBonus: z.number().describe("Attacker's to-hit bonus"),
		targetAC: z.number().describe("Target's armor class"),
		damageDice: z.string().describe("Damage dice notation, e.g. '2d6+3'"),
		damageType: z.string().describe("Damage type, e.g. 'slashing'"),
	}),
	outputSchema: z.object({
		attackRoll: z.number(),
		naturalRoll: z.number(),
		isCritical: z.boolean(),
		isFumble: z.boolean(),
		hit: z.boolean(),
		damageRolls: z.array(z.number()).optional(),
		totalDamage: z.number(),
		narrative: z.string(),
	}),
	execute: async (input) => {
		const { attackerName, targetName, toHitBonus, targetAC, damageDice, damageType } = input;

		const naturalRoll = Math.floor(Math.random() * 20) + 1;
		const attackRoll = naturalRoll + toHitBonus;
		const isCritical = naturalRoll === 20;
		const isFumble = naturalRoll === 1;
		const hit = isCritical || (!isFumble && attackRoll >= targetAC);

		let totalDamage = 0;
		const damageRolls: number[] = [];

		if (hit) {
			const match = damageDice.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
			if (match) {
				const count = Number.parseInt(match[1], 10) * (isCritical ? 2 : 1);
				const sides = Number.parseInt(match[2], 10);
				const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;

				for (let i = 0; i < count; i++) {
					damageRolls.push(Math.floor(Math.random() * sides) + 1);
				}
				totalDamage = Math.max(0, damageRolls.reduce((a, b) => a + b, 0) + modifier);
			}
		}

		let narrative: string;
		if (isCritical) {
			narrative = `⚔️ CRITICAL HIT! ${attackerName} rolls a natural 20! They strike ${targetName} for ${totalDamage} ${damageType} damage!`;
		} else if (isFumble) {
			narrative = `💨 Critical miss! ${attackerName} rolls a natural 1 and whiffs completely!`;
		} else if (hit) {
			narrative = `🎯 ${attackerName} rolls ${attackRoll} (${naturalRoll}+${toHitBonus}) vs AC ${targetAC} — hit! ${totalDamage} ${damageType} damage to ${targetName}.`;
		} else {
			narrative = `🛡️ ${attackerName} rolls ${attackRoll} (${naturalRoll}+${toHitBonus}) vs AC ${targetAC} — miss!`;
		}

		return {
			attackRoll,
			naturalRoll,
			isCritical,
			isFumble,
			hit,
			damageRolls,
			totalDamage,
			narrative,
		};
	},
});

// ── Pure helper functions for direct testing ──

export interface KeepDrop {
	type: "kh" | "kl" | "dh" | "dl";
	n: number;
}

export interface ParsedDice {
	count: number;
	sides: number;
	keepDrop: KeepDrop | null;
	modifier: number;
}

/**
 * Parse dice notation including keep/drop modifiers.
 * Supports: "2d6+3", "2d20kh1+5", "4d6dl1", "2d20kl1-2"
 */
export function parseDiceNotation(notation: string): ParsedDice {
	const match = notation.match(/^(\d+)d(\d+)(?:(kh|kl|dh|dl)(\d+))?([+-]\d+)?$/i);
	if (!match) throw new Error(`Invalid dice notation: ${notation}`);
	return {
		count: Number.parseInt(match[1], 10),
		sides: Number.parseInt(match[2], 10),
		keepDrop: match[3]
			? { type: match[3].toLowerCase() as KeepDrop["type"], n: Number.parseInt(match[4], 10) }
			: null,
		modifier: match[5] ? Number.parseInt(match[5], 10) : 0,
	};
}

/**
 * Apply keep/drop logic to a set of rolls.
 * - kh(n): keep highest n
 * - kl(n): keep lowest n
 * - dh(n): drop highest n
 * - dl(n): drop lowest n
 */
export function applyKeepDrop(rolls: number[], keepDrop: KeepDrop | null): number[] {
	if (!keepDrop) return [...rolls];

	const sorted = [...rolls].sort((a, b) => a - b);
	const { type, n } = keepDrop;

	switch (type) {
		case "kh":
			return sorted.slice(-n);
		case "kl":
			return sorted.slice(0, n);
		case "dh":
			return sorted.slice(0, Math.max(0, sorted.length - n));
		case "dl":
			return sorted.slice(n);
	}
}

export function calculateAbilityModifier(score: number) {
	const modifier = Math.floor((score - 10) / 2);
	return { score, modifier, modifierString: modifier >= 0 ? `+${modifier}` : `${modifier}` };
}
