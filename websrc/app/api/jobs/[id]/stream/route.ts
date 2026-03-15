import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeJob } from "@/lib/mass-ops";
import { getJob, getTemplate, updateJobStatus, patchJob } from "@/lib/services";
import type { JobPhaseEvent, JobPhaseResult } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.error === "RefreshTokenMissing" || session.error === "RefreshTokenError") {
    return new NextResponse("Session expired — please sign in again", { status: 401 });
  }

  const job = await getJob(params.id);
  if (!job) {
    return new NextResponse("Job not found", { status: 404 });
  }

  // If the job already completed, stream a synthetic done event and close
  if (job.status === "succeeded" || job.status === "failed") {
    const event: JobPhaseEvent = { type: "job_done", status: job.status, metrics: job.metrics };
    const body = `data: ${JSON.stringify(event)}\n\n`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  const template = await getTemplate(job.templateId);
  if (!template) {
    return new NextResponse("Template not found", { status: 404 });
  }

  // Mark running before streaming begins
  await updateJobStatus(job.id, "running");

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let totalSuccess = 0;
      let totalFailed = 0;
      const startTime = Date.now();
      const phases: Record<string, JobPhaseResult> = {};

      const send = (event: JobPhaseEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of executeJob(
          job,
          template,
          session.accessToken,
          session.webApiUrl,
          session.systemUserToken
        )) {
          send(event);
          if (event.type === "phase_done") {
            totalSuccess += event.success;
            totalFailed += event.failed;
            phases[event.entityType] = { success: event.success, failed: event.failed };
          }
        }

        const finalStatus = totalFailed === 0 ? "succeeded" : "failed";
        const metrics = {
          total: totalSuccess + totalFailed,
          success: totalSuccess,
          failed: totalFailed,
          durationSeconds: Math.round((Date.now() - startTime) / 1000)
        };

        await patchJob(job.id, {
          status: finalStatus,
          completedAt: new Date().toISOString(),
          metrics,
          phases
        });

        send({ type: "job_done", status: finalStatus, metrics });
      } catch (err) {
        await updateJobStatus(job.id, "failed");
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
