"use strict";

const status = document.querySelector("#verify-status");
const loginLink = document.querySelector("#verify-login");
const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
history.replaceState(null, "", window.location.pathname);

if (!token) {
  if (status) status.textContent = "This verification link is missing or incomplete. Request a new link from the sign-in page.";
  if (loginLink) loginLink.hidden = false;
} else {
  fetch("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ token })
  }).then(async response => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to verify this email.");
    if (status) status.textContent = result.message || "Email verified. You can now sign in.";
  }).catch(error => {
    if (status) status.textContent = error.message;
  }).finally(() => {
    if (loginLink) loginLink.hidden = false;
  });
}
