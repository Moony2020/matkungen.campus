document.addEventListener("DOMContentLoaded", () => {
  const token = window.location.pathname.split("/").pop();

  if (!token) {
    showMessage("Invalid or expired reset link.", true);
    setTimeout(() => window.location.href = "/", 3000);
    return;
  }

  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const messageDiv = document.getElementById("message");
    messageDiv.innerHTML = ""; // clear previous messages

    if (password !== confirmPassword) {
      showMessage("Passwords do not match", true);
      return;
    }

    if (password.length < 6) {
      showMessage("Password must be at least 6 characters", true);
      return;
    }

    try {
      const response = await fetch(`/api/reset-password/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Password reset failed");
      }

      showMessage(
        `Password updated successfully! <a href="/" id="go-login">Back to login</a>`,
        false
      );

      document.getElementById("reset-form").reset();

      // Wait until the message renders and then attach event listener
      setTimeout(() => {
        document.getElementById("go-login")?.addEventListener("click", function (e) {
          e.preventDefault();
          window.location.href = "/?showLogin=true";
        });
      }, 100);

    } catch (err) {
      showMessage(err.message || "Something went wrong", true);
    }
  });

  function showMessage(message, isError) {
    const messageDiv = document.getElementById("message");
    const notification = document.createElement("div");
    notification.className = `notification ${isError ? "error" : "success"}`;
    notification.innerHTML = message;
    messageDiv.appendChild(notification);
  }
});
