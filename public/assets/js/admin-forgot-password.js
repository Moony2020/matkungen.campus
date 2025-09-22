// admin-forgot-password.js
// /assets/js/admin-forgot-password.js

(function () {
  // simple toast helper (no external file needed)
  const toastEl = document.getElementById("notification-toast");
  function showToast(msg, type = "success") {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = `notification-toast ${type} show`;
    setTimeout(() => toastEl.classList.remove("show"), 3000);
  }

  document
    .getElementById("forgot-password-form")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();

      try {
        const res = await fetch("/api/admin/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Failed to send reset email");

        showToast("Reset link sent to your email.", "success");
      } catch (err) {
        showToast(err.message || "Something went wrong", "error");
      }
    });
})();
