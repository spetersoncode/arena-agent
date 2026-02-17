import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: string;
}

export function ArenaPage({ arenaId }: { arenaId: string }) {
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const queryClient = useQueryClient();

	const { data: messages, isLoading } = useQuery({
		queryKey: ["arena-messages", arenaId],
		queryFn: async () => {
			const res = await api.api.arenas[":id"].messages.$get({
				param: { id: arenaId },
			});
			return res.json();
		},
		refetchInterval: false,
	});

	const sendMessage = useMutation({
		mutationFn: async (message: string) => {
			const res = await api.api.arenas[":id"].chat.$post({
				param: { id: arenaId },
				json: { message },
			});
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["arena-messages", arenaId] });
			setInput("");
		},
	});

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, []);

	const messageList: Message[] = messages && "data" in messages ? (messages.data as Message[]) : [];

	return (
		<Layout>
			<div className="flex h-[calc(100vh-8rem)] flex-col">
				{/* Header */}
				<div className="mb-4 flex items-center gap-3">
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

				{/* Messages */}
				<Card className="flex-1 overflow-hidden">
					<ScrollArea className="h-full p-4" ref={scrollRef}>
						{isLoading && <p className="text-center text-muted-foreground">Loading messages...</p>}
						<div className="space-y-4">
							{messageList.map((msg, i) => (
								<div key={msg.id ?? i}>
									<div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
										<div
											className={`max-w-[80%] rounded-lg px-4 py-2 ${
												msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
											}`}
										>
											{msg.role === "assistant" && (
												<p className="mb-1 text-xs font-semibold text-primary">⚔️ Arena Master</p>
											)}
											<div className="whitespace-pre-wrap text-sm">{msg.content}</div>
										</div>
									</div>
									{i < messageList.length - 1 && msg.role === "assistant" && (
										<Separator className="my-3" />
									)}
								</div>
							))}
							{sendMessage.isPending && (
								<div className="flex justify-start">
									<div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
										<p className="mb-1 text-xs font-semibold text-primary">⚔️ Arena Master</p>
										<p className="text-sm text-muted-foreground animate-pulse">Rolling dice...</p>
									</div>
								</div>
							)}
						</div>
					</ScrollArea>
				</Card>

				{/* Input */}
				<form
					className="mt-3 flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (input.trim() && !sendMessage.isPending) {
							sendMessage.mutate(input.trim());
						}
					}}
				>
					<Input
						placeholder="Command the arena... (e.g. 'next round', 'the paladin attacks the goblin')"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						disabled={sendMessage.isPending}
						className="flex-1"
					/>
					<Button type="submit" disabled={!input.trim() || sendMessage.isPending}>
						<Send className="h-4 w-4" />
					</Button>
				</form>
			</div>
		</Layout>
	);
}
