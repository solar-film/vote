import { env } from "cloudflare:workers";
import { handlePoll, type VoteEnv } from "@/lib/poll-service";
export async function POST(request: Request) { return handlePoll(request, env as unknown as VoteEnv, "control"); }
