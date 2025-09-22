document.addEventListener("DOMContentLoaded", () => {
  const token = window.location.pathname.split("/").pop();
  const rememberCheckbox = document.getElementById("remember-reset");

  // Initialize "remember me" state
  if (rememberCheckbox && localStorage.getItem("rememberUser") === "true") {
    rememberCheckbox.checked = true;
  }

  document
    .getElementById("reset-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const password = document.getElementById("new-password").value;
      const confirmPassword = document.getElementById("confirm-password").value;
      const remember = !!(rememberCheckbox && rememberCheckbox.checked);
      const messageDiv = document.getElementById("message");

      // Clear previous messages
      messageDiv.innerHTML = "";

      if (password !== confirmPassword) {
        showMessage("Passwords do not match", true);
        return;
      }

      if (password.length < 6) {
        showMessage("Password must be at least 6 characters", true);
        return;
      }

      try {
        const response = await fetch(`/api/auth/reset-password/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, remember }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Password reset failed");
        }

        // Show success message that will auto-disappear
        showMessage("Password updated successfully!", false);

        // Then show the "Back to login" link separately after a delay
        setTimeout(() => {
          showLoginLink();
        }, 2000);

        document.getElementById("reset-form").reset();

        // Store remember preference
        localStorage.setItem("rememberUser", remember.toString());
      } catch (err) {
        showMessage(err.message || "Something went wrong", true);
      }
    });

  function showMessage(message, isError) {
    const messageDiv = document.getElementById("message");

    // Clear any existing messages except the login link
    const existingMessage = messageDiv.querySelector(
      ".success-message, .error-message"
    );
    if (existingMessage) {
      messageDiv.removeChild(existingMessage);
    }

    const messageEl = document.createElement("div");
    messageEl.className = isError ? "error-message" : "success-message";
    messageEl.textContent = message;
    messageDiv.appendChild(messageEl);

    // Auto-hide after 2 seconds for success messages
    if (!isError) {
      setTimeout(() => {
        if (messageEl.parentElement === messageDiv) {
          messageEl.style.animation = "fadeOut 0.5s ease forwards";
          setTimeout(() => {
            if (messageEl.parentElement === messageDiv) {
              messageDiv.removeChild(messageEl);
            }
          }, 500);
        }
      }, 2000);
    }
  }

  function showLoginLink() {
    const messageDiv = document.getElementById("message");

    // Clear any existing login link
    const existingLink = messageDiv.querySelector(".back-to-login");
    if (existingLink) {
      messageDiv.removeChild(existingLink);
    }

    const loginLink = document.createElement("a");
    loginLink.href = "/";
    loginLink.className = "back-to-login";
    loginLink.textContent = "Back to login";
    loginLink.id = "go-login";

    loginLink.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "/?showLogin=true";
    });

    messageDiv.appendChild(loginLink);
  }
});
