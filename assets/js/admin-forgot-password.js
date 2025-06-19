// admin-forgot-password.js

import { showToast } from "./utils.js";

document
  .getElementById("forgot-password-form")
  .addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value;

    try {
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reset email");

      showToast("Reset link sent to your email.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
