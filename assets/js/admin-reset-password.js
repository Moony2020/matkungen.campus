// admin-reset-password.js

document.addEventListener("DOMContentLoaded", function() {
  const token = window.location.pathname.split("/").pop();
  document.getElementById("reset-token").value = token;

  const form = document.getElementById("reset-password-form");

  form.addEventListener("submit", async function(e) {
    e.preventDefault();

    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const token = document.getElementById("reset-token").value;

    if (newPassword !== confirmPassword) {
      showToast("Passwords don't match", "error");
      return;
    }

    try {
      const res = await fetch(`/api/admin/reset-password/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");

      showToast("Password reset successful. You can now log in.", "success");
      setTimeout(() => (window.location.href = "/admin-login.html"), 2000);
    } catch (err) {
      showToast(err.message, "error");
    }
  });
});

function showToast(message, type = "success") {
  const toast = document.getElementById("notification-toast");
  toast.textContent = message;
  toast.className = `notification-toast ${type}`;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

document.querySelectorAll(".toggle-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-target");
    const input = document.getElementById(targetId);

    if (input.type === "password") {
      input.type = "text";
      btn.innerHTML = '<i class="ri-eye-line"></i>'; // open eye
    } else {
      input.type = "password";
      btn.innerHTML = '<i class="ri-eye-off-line"></i>'; // closed eye
    }
  });
});
