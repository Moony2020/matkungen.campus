document.addEventListener("DOMContentLoaded", function () {
  // DOM elements
  const loginForm = document.getElementById("admin-login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberCheckbox = document.getElementById("remember");
  const toast = document.getElementById("notification-toast");
  const togglePasswordBtns = document.querySelectorAll(".toggle-password");

  // Initialize "remember me" state
  if (localStorage.getItem("rememberAdmin") === "true") {
    rememberCheckbox.checked = true;
  }

  // Password visibility toggle
  togglePasswordBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      const icon = btn.querySelector("i");

      if (input.type === "password") {
        input.type = "text";
        icon.className = "ri-eye-line";
      } else {
        input.type = "password";
        icon.className = "ri-eye-off-line";
      }
    });
  });

  // Show notification function
  function showToast(message, type = "error") {
    // Set message
    toast.textContent = message;

    // Reset classes and set new type
    toast.className = "notification-toast";
    toast.classList.add(type);

    // Show toast with animation
    toast.style.display = "block";
    toast.style.opacity = 1;
    toast.style.visibility = "visible";

    // Auto-hide after 4 seconds
    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => {
        toast.style.visibility = "hidden";
      }, 300);
    }, 4000);
  }

  // Handle form submission
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const remember = rememberCheckbox.checked;
    const loginButton = document.querySelector(".login-button");
    const originalButtonText = loginButton.innerHTML;

    // Validate inputs
    if (!email) {
      showToast("Please enter your email address");
      emailInput.focus();
      return;
    }

    if (!password) {
      showToast("Please enter your password");
      passwordInput.focus();
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Please enter a valid email address");
      emailInput.focus();
      return;
    }

    // Show loading state
    loginButton.innerHTML =
      '<i class="ri-loader-4-line animate-spin"></i> Logging in...';
    loginButton.disabled = true;

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          remember,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || "Incorrect email or password";

        // More specific messages for different status codes
        if (response.status === 400) {
          errorMessage = data.error || "Please check your input";
        } else if (response.status === 500) {
          errorMessage = "Server error. Please try again later.";
        }

        throw new Error(errorMessage);
      }

      // Store token and remember preference
      localStorage.setItem("adminToken", data.token);
      if (remember) {
        localStorage.setItem("rememberAdmin", "true");
      } else {
        localStorage.removeItem("rememberAdmin");
      }

      // Show success message
      showToast("✅ Login successful! Redirecting...", "success");

      // Redirect to admin dashboard
      setTimeout(() => {
        window.location.href = "/admin.html";
      }, 1500);
    } catch (error) {
      showToast(`⚠️ ${error.message}`);

      // Reset button state
      loginButton.innerHTML = originalButtonText;
      loginButton.disabled = false;

      // Clear password field on error
      passwordInput.value = "";
      passwordInput.focus();
    }
  });
});
