import { z } from "zod";

// ── D&D 5e Ability Scores ──
export const abilityScoresSchema = z.object({
	strength: z.number().min(1).max(30),
	dexterity: z.number().min(1).max(30),
	constitution: z.number().min(1).max(30),
	intelligence: z.number().min(1).max(30),
	wisdom: z.number().min(1).max(30),
	charisma: z.number().min(1).max(30),
});

// ── Creature / Combatant ──
export const creatureSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	type: z.enum(["player", "monster", "npc"]),
	armorClass: z.number().min(1),
	hitPoints: z.number().min(1),
	maxHitPoints: z.number().min(1),
	abilityScores: abilityScoresSchema,
	initiative: z.number().optional(),
	attacks: z.array(
		z.object({
			name: z.string(),
			toHitBonus: z.number(),
			damageDice: z.string(),
			damageType: z.string(),
		}),
	),
	conditions: z.array(z.string()).default([]),
	isAlive: z.boolean().default(true),
});

// ── Arena / Encounter ──
export const arenaSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	status: z.enum(["setup", "active", "completed"]),
	round: z.number().default(0),
	turnIndex: z.number().default(0),
	combatants: z.array(creatureSchema),
	log: z.array(
		z.object({
			round: z.number(),
			message: z.string(),
			timestamp: z.string(),
		}),
	),
	createdBy: z.string(),
	createdAt: z.string(),
});

// ── Chat Messages ──
export const chatMessageSchema = z.object({
	id: z.string(),
	arenaId: z.string().optional(),
	role: z.enum(["user", "assistant"]),
	content: z.string(),
	createdAt: z.string(),
});

// ── RBAC Roles ──
export const roleSchema = z.enum(["admin", "player", "spectator"]);

// ── API Request schemas ──
export const createArenaRequestSchema = z.object({
	message: z.string().min(1).max(2000),
});

export const chatRequestSchema = z.object({
	message: z.string().min(1).max(2000),
});

// ── Inferred types ──
export type AbilityScores = z.infer<typeof abilityScoresSchema>;
export type Creature = z.infer<typeof creatureSchema>;
export type Arena = z.infer<typeof arenaSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Role = z.infer<typeof roleSchema>;
export type CreateArenaRequest = z.infer<typeof createArenaRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
