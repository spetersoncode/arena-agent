import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArenaPage } from "../arena";

// Mock EventSource globally as a proper constructor
class MockEventSource {
	static CLOSED = 2;
	static instances: MockEventSource[] = [];
	readyState = 0;
	onerror: (() => void) | null = null;
	addEventListener = vi.fn();
	close = vi.fn();
	constructor(public url: string) {
		MockEventSource.instances.push(this);
	}
}
vi.stubGlobal("EventSource", MockEventSource);

// Mock the API client
vi.mock("@/lib/api", () => ({
	api: {
		api: {
			arenas: {
				":id": {
					$get: vi.fn().mockResolvedValue({
						json: () =>
							Promise.resolve({
								success: true,
								data: {
									id: "test-arena",
									name: "3 goblins vs a paladin",
									description: "3 goblins vs a paladin",
									status: "setup",
									round: 0,
									combatants: [],
									log: [],
								},
							}),
					}),
					messages: {
						$get: vi.fn().mockResolvedValue({
							json: () => Promise.resolve({ success: true, data: [] }),
						}),
					},
				},
			},
		},
	},
}));

function renderWithProviders(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
	vi.clearAllMocks();
	MockEventSource.instances = [];
});

describe("ArenaPage", () => {
	it("renders the combat arena header", () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		expect(screen.getByText("Combat Arena")).toBeInTheDocument();
	});

	it("shows preparing state while loading", () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		expect(screen.getByText("Preparing the arena...")).toBeInTheDocument();
	});

	it("auto-starts combat via EventSource when no existing messages", async () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		await waitFor(() => {
			expect(MockEventSource.instances.length).toBe(1);
			expect(MockEventSource.instances[0].url).toBe("/api/arenas/test-arena/run");
		});
	});
});
