// utils/sendEmail.js
const nodemailer = require("nodemailer");

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM, // e.g. "Matkungen <mymoon676@gmail.com>"
  SMTP_HOST, // optional fallback host
  SMTP_PORT, // optional fallback port (e.g. 587)
  SMTP_SECURE, // "true" or "false"
  ALLOW_INSECURE_TLS, // "true" to skip TLS verify (last resort)
} = process.env;

// Boot-time sanity checks
if (!EMAIL_USER || !EMAIL_PASS) {
  console.error(
    "❌ EMAIL_USER/EMAIL_PASS missing. Set them in env (use a Gmail App Password)."
  );
}
if (!EMAIL_FROM) {
  console.warn(
    '⚠️ EMAIL_FROM missing. Defaulting to EMAIL_USER as "from". Set EMAIL_FROM="Matkungen <you@gmail.com>".'
  );
}

function bool(v, def = false) {
  if (typeof v === "string")
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  if (typeof v === "boolean") return v;
  return def;
}

// Primary: Gmail (465 SSL)
function gmailTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: !bool(ALLOW_INSECURE_TLS, true) },
  });
}

// Fallback: generic SMTP (587 STARTTLS or configured host)
function fallbackTransport() {
  const port = Number(SMTP_PORT || 587);
  const secure = bool(SMTP_SECURE, false);
  const host = SMTP_HOST || "smtp.gmail.com"; // can be your ESP, e.g. SendGrid/Mailgun SMTP
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      tls: { rejectUnauthorized: !bool(ALLOW_INSECURE_TLS, true) },
    }),
    meta: { host, port, secure },
  };
}

async function sendOrderEmail({ to, subject, html, text, pdfBuffer }) {
  const from = EMAIL_FROM || EMAIL_USER;

  // Try Gmail first
  try {
    const t = gmailTransport();
    console.log("✉️ Trying Gmail SMTP (465/SSL)...");
    await t.verify();
    const info = await t.sendMail({
      from,
      to,
      subject,
      html,
      text,
      attachments: pdfBuffer
        ? [
            {
              filename: "receipt.pdf",
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    });
    console.log("✅ Email sent via Gmail:", {
      to,
      subject,
      id: info.messageId,
      response: info.response,
    });
    return info;
  } catch (e1) {
    console.error("❌ Gmail SMTP failed:", e1?.message || e1);
  }

  // Fallback to STARTTLS 587 (or custom host)
  const fb = fallbackTransport();
  try {
    console.log(
      `✉️ Trying fallback SMTP (${fb.meta.host}:${fb.meta.port}${
        fb.meta.secure ? "/SSL" : "/STARTTLS"
      })...`
    );
    await fb.transport.verify();
    const info = await fb.transport.sendMail({
      from,
      to,
      subject,
      html,
      attachments: pdfBuffer
        ? [
            {
              filename: "receipt.pdf",
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    });
    console.log("✅ Email sent via fallback SMTP:", {
      to,
      subject,
      id: info.messageId,
      response: info.response,
    });
    return info;
  } catch (e2) {
    console.error("❌ Fallback SMTP failed:", e2?.message || e2);
    throw e2;
  }
}

module.exports = { sendOrderEmail };

// Usage:
// const { sendOrderEmail } = require("./sendEmail");
// await sendOrderEmail({ to, subject, html, pdfBuffer });
