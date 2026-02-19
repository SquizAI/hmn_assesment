// ============================================================
// HMN CASCADE - Resend Email Module
// ============================================================

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY || "";
  if (key) _resend = new Resend(key);
  return _resend;
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "assessments@behmn.com";
}

function getFromName(): string {
  return process.env.RESEND_FROM_NAME || "HMN Assessments";
}

function getAppUrl(): string {
  return process.env.APP_URL || "https://hmn-assessments-heih8.ondigitalocean.app";
}

export function isEmailEnabled(): boolean {
  return !!getResend();
}

export function buildInviteUrl(token: string): string {
  return `${getAppUrl()}/?invite=${token}`;
}

// ---- HTML Email Template ----

function buildInvitationEmailHtml(params: {
  participantName: string;
  assessmentName: string;
  inviteUrl: string;
  note?: string;
}): string {
  const { participantName, assessmentName, inviteUrl, note } = params;

  const noteSection = note
    ? `<tr><td style="padding:0 40px 24px">
        <div style="background:#f8f5ff;border-left:3px solid #7c3aed;padding:12px 16px;border-radius:0 8px 8px 0">
          <p style="margin:0;font-size:13px;color:#6b7280;font-style:italic">"${note}"</p>
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You've been invited</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a0a12 0%,#1a1a2e 100%);padding:32px 40px;text-align:center">
              <img src="${getAppUrl()}/hmn_logo.png" alt="HMN" width="80" style="display:inline-block;margin-bottom:8px">
              <p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;letter-spacing:1px">ASSESSMENTS</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 16px">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">You've been invited</h1>
              <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6">
                Hi ${participantName},
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.6">
                You've been invited to complete the <strong>${assessmentName}</strong>. This guided assessment will help evaluate capabilities and identify growth opportunities.
              </p>
            </td>
          </tr>

          ${noteSection}

          <!-- CTA Button -->
          <tr>
            <td style="padding:8px 40px 32px;text-align:center">
              <a href="${inviteUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;border-radius:12px;letter-spacing:0.3px">
                Start Your Assessment
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 32px;text-align:center">
              <p style="margin:0;font-size:13px;color:#9ca3af">
                This link is unique to you. Click the button above or copy this URL:
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:#7c3aed;word-break:break-all">
                ${inviteUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center">
              <p style="margin:0;font-size:12px;color:#9ca3af">
                HMN Cascade Assessment System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---- Send Functions ----

export async function sendInvitationEmail(params: {
  to: string;
  participantName: string;
  assessmentName: string;
  inviteToken: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const client = getResend();
  if (!client) {
    return { ok: false, error: "Email not configured" };
  }

  const inviteUrl = buildInviteUrl(params.inviteToken);
  const html = buildInvitationEmailHtml({
    participantName: params.participantName,
    assessmentName: params.assessmentName,
    inviteUrl,
    note: params.note,
  });

  try {
    const { error } = await client.emails.send({
      from: `${getFromName()} <${getFromEmail()}>`,
      to: params.to,
      subject: `You're invited: ${params.assessmentName}`,
      html,
    });

    if (error) {
      console.error(`Resend error for ${params.to}:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Resend error for ${params.to}:`, message);
    return { ok: false, error: message };
  }
}

export async function sendBatchInvitationEmails(invitations: Array<{
  to: string;
  participantName: string;
  assessmentName: string;
  inviteToken: string;
  note?: string;
}>): Promise<{
  sent: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}> {
  const results = await Promise.allSettled(
    invitations.map((inv) => sendInvitationEmail(inv))
  );

  let sent = 0;
  let failed = 0;
  const errors: Array<{ email: string; error: string }> = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value.ok) {
      sent++;
    } else {
      failed++;
      const errMsg =
        result.status === "fulfilled"
          ? result.value.error || "Unknown error"
          : result.reason?.message || "Unknown error";
      errors.push({ email: invitations[i].to, error: errMsg });
    }
  });

  return { sent, failed, errors };
}
