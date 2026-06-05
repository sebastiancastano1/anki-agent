import { NextRequest } from "next/server";
import * as traceloop from "@traceloop/node-server-sdk";
import { runResearchAgent } from "@/lib/agent/researchAgent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { topic, count } = await req.json().catch(() => ({ topic: "" }));

  if (!topic || typeof topic !== "string") {
    return new Response(JSON.stringify({ error: "topic is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        // Span raíz del run: agrupa todos los turnos del agente bajo una sola
        // traza. Consumir el generador DENTRO del callback asegura que cada
        // `messages.create` (y su auto-span) quede como hijo de este workflow.
        await traceloop.withWorkflow(
          { name: "research_pipeline", associationProperties: { topic } },
          async () => {
            for await (const event of runResearchAgent(topic, count)) {
              send(event);
            }
          }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
