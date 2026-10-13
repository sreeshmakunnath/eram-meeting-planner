import nodemailer from "nodemailer";

const appName = "ERAM Meeting Planner";

function transport() {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Calibri,Segoe UI,Arial,sans-serif;color:#1f2937">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1F3864;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold">ERAM Holdings · ${appName}</td></tr>
    <tr><td style="padding:24px"><h2 style="margin:0 0 12px;color:#1F3864;font-size:20px">${title}</h2>${bodyHtml}</td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">This is an automated message from ${appName}.</td></tr>
  </table></td></tr></table></body></html>`;
}

export function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#2E75B6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${label}</a></p>`;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Sends an email. Without SMTP_HOST (local dev) the message is printed to the server console instead. */
export async function sendMail(to: string | string[], subject: string, title: string, bodyHtml: string) {
  const html = layout(title, bodyHtml);
  const t = transport();
  if (!t) {
    const links = [...bodyHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const text = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`\n--- EMAIL (SMTP not configured) ---\nTo: ${[to].flat().join(", ")}\nSubject: ${subject}\n${text}${links.length ? `\nLinks: ${links.join(" ")}` : ""}\n---\n`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || `${appName} <no-reply@localhost>`, to, subject, html });
  } catch (e) {
    // A failed email should not fail the user's action; it is logged for follow-up.
    console.error("sendMail failed", subject, e);
  }
}

export const appUrl = (path: string) => `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
