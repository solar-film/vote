import { env } from "cloudflare:workers";
import { handlePoll, type VoteEnv } from "@/lib/poll-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handlePoll(request, env as unknown as VoteEnv, "state"); }
