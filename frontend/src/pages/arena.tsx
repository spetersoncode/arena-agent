import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";

type CombatStatus = "setup" | "active" | "completed" | "error";

export function ArenaPage({ arenaId }: { arenaId: string }) {
	const [combatText, setCombatText] = useState("");
	const [status, setStatus] = useState<CombatStatus>("setup");
	const [error, setError] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
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

	// Load existing combat log if present
	useEffect(() => {
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
				setCombatText(fullLog);
				setStatus("completed");
			}
		}
	}, [existingMessages]);

	// Auto-scroll as text streams in
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on combatText change
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [combatText]);

	const startCombat = useCallback(() => {
		setIsStreaming(true);
		setStatus("active");
		setCombatText("");
		setError(null);

		const eventSource = new EventSource(`/api/arenas/${arenaId}/run`);

		eventSource.addEventListener("chunk", (e) => {
			const data = JSON.parse(e.data);
			setCombatText((prev) => prev + data.text);
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
			// SSE error event can be either an Event (connection error) or MessageEvent (app error)
			if (e instanceof MessageEvent) {
				const data = JSON.parse(e.data);
				setError(data.error);
			} else {
				setError("Connection lost");
			}
			setStatus("error");
			eventSource.close();
			setIsStreaming(false);
		});

		// Handle connection-level errors (e.g., auth failure)
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
			}
		};
	}, [arenaId]);

	const arenaData = arena && "data" in arena ? arena.data : null;
	const scenarioName = arenaData
		? (arenaData as { name: string; description?: string }).description ||
			(arenaData as { name: string }).name
		: "";

	const statusBadge = {
		setup: { label: "Ready", variant: "outline" as const },
		active: { label: "⚔️ Fighting...", variant: "default" as const },
		completed: { label: "Completed", variant: "secondary" as const },
		error: { label: "Error", variant: "destructive" as const },
	}[status];

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
						{loadingMessages && (
							<div className="flex items-center justify-center py-12">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						)}

						{!loadingMessages && !combatText && status === "setup" && (
							<div className="flex flex-col items-center justify-center py-16 text-center">
								<Swords className="mb-4 h-12 w-12 text-muted-foreground/50" />
								<h2 className="mb-2 text-lg font-semibold">Ready to Fight</h2>
								<p className="mb-6 max-w-md text-sm text-muted-foreground">
									The Arena Master will set up the encounter, roll initiative, and run the entire
									combat to completion. Watch the battle unfold in real-time.
								</p>
								<Button size="lg" onClick={startCombat}>
									<Play className="mr-2 h-4 w-4" />
									Start Combat
								</Button>
							</div>
						)}

						{combatText && (
							<div className="prose prose-sm dark:prose-invert max-w-none">
								<Markdown>{combatText}</Markdown>
							</div>
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

						{status === "completed" && combatText && (
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
