const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }, // app password
  tls: {
    rejectUnauthorized: false, // ⚠️ DEV ONLY
  },
});

const sendOrderEmail = async ({ to, subject, html, pdfBuffer }) => {
  const mailOptions = {
    from: `"Matkungen" <${process.env.EMAIL_USER}>`,
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
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendOrderEmail;
