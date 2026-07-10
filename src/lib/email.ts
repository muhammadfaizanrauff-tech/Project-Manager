import "server-only";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";

const FROM_ADDRESS = "Project Manager <notifications@updates.projectmanager.app>";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function sendEmail(to: string, subject: string, html: string) {
  const resend = getResend();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipped email to ${to}: "${subject}"`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

function layout(title: string, body: string) {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #18181b;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: #6366f1; margin: 0 0 12px;">Project Manager</p>
      <h2 style="font-size: 18px; margin: 0 0 12px;">${title}</h2>
      <div style="font-size: 14px; line-height: 1.6; color: #3f3f46;">${body}</div>
      <p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">Created by Faizan Rauf</p>
    </div>
  `;
}

export async function notifyTaskAssigned(params: {
  assigneeId: string;
  taskName: string;
  projectName: string;
  projectId: string;
}) {
  const email = await getUserEmail(params.assigneeId);
  if (!email) return;
  await sendEmail(
    email,
    `You've been assigned: ${params.taskName}`,
    layout(
      "New task assigned to you",
      `<p><strong>${params.taskName}</strong> in project <strong>${params.projectName}</strong> has been assigned to you.</p>`,
    ),
  );
}

export async function notifyManagerOfAssignment(params: {
  managerId: string;
  assigneeName: string;
  taskName: string;
  projectName: string;
}) {
  const email = await getUserEmail(params.managerId);
  if (!email) return;
  await sendEmail(
    email,
    `Task assigned in ${params.projectName}`,
    layout(
      "Task assignment update",
      `<p><strong>${params.taskName}</strong> in <strong>${params.projectName}</strong> was assigned to ${params.assigneeName}.</p>`,
    ),
  );
}

export async function notifyProjectAssigned(params: {
  userId: string;
  projectName: string;
}) {
  const email = await getUserEmail(params.userId);
  if (!email) return;
  await sendEmail(
    email,
    `You've been added to ${params.projectName}`,
    layout(
      "Added to a project",
      `<p>You've been assigned to the project <strong>${params.projectName}</strong>.</p>`,
    ),
  );
}

export async function notifyStatusChange(params: {
  recipientId: string;
  taskName: string;
  projectName: string;
  statusLabel: string;
}) {
  const email = await getUserEmail(params.recipientId);
  if (!email) return;
  await sendEmail(
    email,
    `${params.statusLabel}: ${params.taskName}`,
    layout(
      "Task status update",
      `<p><strong>${params.taskName}</strong> in <strong>${params.projectName}</strong> is now <strong>${params.statusLabel}</strong>.</p>`,
    ),
  );
}
