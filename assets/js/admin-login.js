// admin-login.js

document
  .getElementById("admin-login-form")
  .addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem("adminToken", data.token);
      window.location.href = "/admin.html";
    } catch (err) {
      showToast(err.message, "error");
    }
  });

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
