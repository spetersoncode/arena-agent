import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";

type CombatStatus = "setup" | "active" | "completed" | "error";

interface StatBlock {
	id: string;
	name: string;
	type: string;
	armorClass: number;
	hitPoints: number;
	maxHitPoints: number;
	abilityScores: {
		strength: number;
		dexterity: number;
		constitution: number;
		intelligence: number;
		wisdom: number;
		charisma: number;
	};
	attacks: Array<{
		name: string;
		toHitBonus: number;
		damageDice: string;
		damageType: string;
	}>;
}

interface DiceResult {
	notation: string;
	rolls: number[];
	kept: number[];
	modifier: number;
	total: number;
	purpose?: string;
}

interface AttackResult {
	attackerName: string;
	targetName: string;
	naturalRoll: number;
	attackRoll: number;
	isCritical: boolean;
	isFumble: boolean;
	hit: boolean;
	totalDamage: number;
	narrative: string;
}

type ToolResult =
	| { toolName: "generateStatBlock"; result: StatBlock }
	| { toolName: "rollDice"; result: DiceResult }
	| { toolName: "resolveAttack"; result: AttackResult }
	| { toolName: string; result: unknown };

// Interleaved stream items: either text or a tool result
type StreamItem =
	| { type: "text"; key: string; content: string }
	| { type: "tool-result"; key: string; data: ToolResult };

let itemCounter = 0;
function nextKey(prefix: string): string {
	return `${prefix}-${++itemCounter}`;
}

function abilityMod(score: number): string {
	const mod = Math.floor((score - 10) / 2);
	return mod >= 0 ? `+${mod}` : `${mod}`;
}

function StatBlockCard({ stat }: { stat: StatBlock }) {
	return (
		<div className="my-3 rounded-lg border bg-card p-4 shadow-sm">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="font-bold text-base">{stat.name}</h3>
				<Badge variant="outline" className="text-xs capitalize">
					{stat.type}
				</Badge>
			</div>
			<div className="mb-2 flex gap-4 text-sm">
				<span>
					🛡️ AC <span className="font-semibold">{stat.armorClass}</span>
				</span>
				<span>
					❤️ HP{" "}
					<span className="font-semibold">
						{stat.hitPoints}/{stat.maxHitPoints}
					</span>
				</span>
			</div>
			<div className="mb-2 grid grid-cols-6 gap-1 text-center text-xs">
				{(
					["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const
				).map((ability) => (
					<div key={ability} className="rounded bg-muted px-1 py-1">
						<div className="font-bold uppercase text-muted-foreground">{ability.slice(0, 3)}</div>
						<div className="font-semibold">{stat.abilityScores[ability]}</div>
						<div className="text-muted-foreground">({abilityMod(stat.abilityScores[ability])})</div>
					</div>
				))}
			</div>
			{stat.attacks.length > 0 && (
				<div className="text-xs text-muted-foreground">
					{stat.attacks.map((atk) => (
						<span key={atk.name} className="mr-3">
							⚔️ {atk.name}: +{atk.toHitBonus} to hit, {atk.damageDice} {atk.damageType}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

function DiceRollInline({ result }: { result: DiceResult }) {
	return (
		<div className="my-1 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-xs font-mono">
			<span>🎲</span>
			<span className="text-muted-foreground">{result.notation}</span>
			<span className="font-semibold">→ {result.total}</span>
			{result.purpose && <span className="text-muted-foreground">({result.purpose})</span>}
		</div>
	);
}

function AttackResultCard({ result }: { result: AttackResult }) {
	return (
		<div
			className={`my-1 rounded border px-3 py-1.5 text-sm ${
				result.isCritical
					? "border-yellow-500/50 bg-yellow-500/10"
					: result.isFumble
						? "border-red-500/50 bg-red-500/10"
						: result.hit
							? "border-green-500/50 bg-green-500/10"
							: "border-muted bg-muted/50"
			}`}
		>
			{result.narrative}
		</div>
	);
}

function ToolResultDisplay({ data }: { data: ToolResult }) {
	switch (data.toolName) {
		case "generateStatBlock":
			return <StatBlockCard stat={data.result as StatBlock} />;
		case "rollDice":
			return <DiceRollInline result={data.result as DiceResult} />;
		case "resolveAttack":
			return <AttackResultCard result={data.result as AttackResult} />;
		default:
			return null;
	}
}

export function ArenaPage({ arenaId }: { arenaId: string }) {
	const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
	const [status, setStatus] = useState<CombatStatus>("setup");
	const [error, setError] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const hasStartedRef = useRef(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Load arena metadata
	const { data: arena } = useQuery({
		queryKey: ["arena", arenaId],
		queryFn: async () => {
			const res = await api.api.arenas[":id"].$get({
				param: { id: arenaId },
			});
			return res.json();
		},
	});

	// Check for existing combat log (revisiting a completed arena)
	const { data: existingMessages, isLoading: loadingMessages } = useQuery({
		queryKey: ["arena-messages", arenaId],
		queryFn: async () => {
			const res = await api.api.arenas[":id"].messages.$get({
				param: { id: arenaId },
			});
			return res.json();
		},
	});

	const startCombat = useCallback(() => {
		if (hasStartedRef.current) return;
		hasStartedRef.current = true;

		setIsStreaming(true);
		setStatus("active");
		setStreamItems([]);
		setError(null);

		const eventSource = new EventSource(`/api/arenas/${arenaId}/run`);

		eventSource.addEventListener("chunk", (e) => {
			const data = JSON.parse(e.data);
			setStreamItems((prev) => {
				const last = prev[prev.length - 1];
				// Merge consecutive text chunks
				if (last?.type === "text") {
					return [
						...prev.slice(0, -1),
						{ type: "text" as const, key: last.key, content: last.content + data.text },
					];
				}
				return [...prev, { type: "text" as const, key: nextKey("t"), content: data.text }];
			});
		});

		eventSource.addEventListener("tool-result", (e) => {
			const data = JSON.parse(e.data);
			setStreamItems((prev) => [
				...prev,
				{
					type: "tool-result" as const,
					key: nextKey("r"),
					data: { toolName: data.toolName, result: data.result },
				},
			]);
		});

		eventSource.addEventListener("status", (e) => {
			const data = JSON.parse(e.data);
			setStatus(data.status);
			if (data.status === "completed") {
				eventSource.close();
				setIsStreaming(false);
			}
		});

		eventSource.addEventListener("error", (e) => {
			if (e instanceof MessageEvent) {
				const data = JSON.parse(e.data);
				setError(data.error);
			} else {
				setError("Connection lost");
			}
			setStatus("error");
			eventSource.close();
			setIsStreaming(false);
			hasStartedRef.current = false;
		});

		eventSource.onerror = () => {
			if (eventSource.readyState === EventSource.CLOSED) {
				setStatus((prev) => {
					if (prev !== "completed") {
						setError("Connection closed unexpectedly");
						return "error";
					}
					return prev;
				});
				setIsStreaming(false);
				hasStartedRef.current = false;
			}
		};
	}, [arenaId]);

	// Load existing combat log if present, otherwise auto-start combat
	useEffect(() => {
		if (loadingMessages) return;

		if (existingMessages && "data" in existingMessages) {
			const messages = existingMessages.data as Array<{
				role: string;
				content: string;
			}>;
			if (messages.length > 0) {
				const fullLog = messages
					.filter((m) => m.role === "assistant")
					.map((m) => m.content)
					.join("\n\n");
				setStreamItems([{ type: "text", key: "saved", content: fullLog }]);
				setStatus("completed");
				return;
			}
		}

		startCombat();
	}, [existingMessages, loadingMessages, startCombat]);

	// Auto-scroll as stream items update
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on new items
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [streamItems]);

	const arenaData = arena && "data" in arena ? arena.data : null;
	const scenarioName = arenaData
		? (arenaData as { name: string; description?: string }).description ||
			(arenaData as { name: string }).name
		: "";

	const statusBadge = {
		setup: { label: "Starting...", variant: "outline" as const },
		active: { label: "⚔️ Fighting...", variant: "default" as const },
		completed: { label: "Completed", variant: "secondary" as const },
		error: { label: "Error", variant: "destructive" as const },
	}[status];

	const hasContent = streamItems.length > 0;

	return (
		<Layout>
			<div className="flex h-[calc(100vh-8rem)] flex-col">
				{/* Header */}
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<a href="/">
							<Button variant="ghost" size="icon">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</a>
						<div className="flex items-center gap-2">
							<Swords className="h-5 w-5 text-primary" />
							<h1 className="text-xl font-bold">Combat Arena</h1>
						</div>
					</div>
					<Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
				</div>

				{/* Scenario description */}
				{scenarioName && (
					<div className="mb-3 rounded-lg border bg-muted/50 px-4 py-2">
						<p className="text-sm text-muted-foreground">
							<span className="font-medium text-foreground">Scenario:</span> {scenarioName}
						</p>
					</div>
				)}

				{/* Combat log */}
				<Card className="flex-1 overflow-hidden">
					<ScrollArea className="h-full p-6" ref={scrollRef}>
						{(loadingMessages || (status === "setup" && !hasContent)) && (
							<div className="flex flex-col items-center justify-center py-16">
								<Swords className="mb-4 h-12 w-12 text-muted-foreground/50 animate-pulse" />
								<p className="text-sm text-muted-foreground animate-pulse">
									Preparing the arena...
								</p>
							</div>
						)}

						{streamItems.map((item) =>
							item.type === "text" ? (
								<div key={item.key} className="prose prose-sm dark:prose-invert max-w-none">
									<Markdown>{item.content}</Markdown>
								</div>
							) : (
								<ToolResultDisplay key={item.key} data={item.data} />
							),
						)}

						{isStreaming && (
							<div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								<span className="animate-pulse">Combat in progress...</span>
							</div>
						)}

						{error && (
							<div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
								<p className="text-sm text-destructive">{error}</p>
								<Button variant="outline" size="sm" className="mt-2" onClick={startCombat}>
									Retry
								</Button>
							</div>
						)}

						{status === "completed" && hasContent && (
							<div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3 text-center">
								<p className="text-sm font-medium text-muted-foreground">⚔️ Combat Complete</p>
							</div>
						)}
					</ScrollArea>
				</Card>
			</div>
		</Layout>
	);
}
