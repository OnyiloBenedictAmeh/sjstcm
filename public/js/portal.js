"use strict";


// ============================================================
// LOGIN
// ============================================================

const form =
  document.querySelector(
    "#login-form"
  );

async function redirectIfAuthenticated() {
  if (!form) return;

  try {
    const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const user = await response.json();
    const destination = user.role === "ADMIN" || user.role === "STAFF"
      ? "admin/"
      : user.role === "STUDENT"
        ? "student/index.html"
        : user.role === "ALUMNI"
          ? "alumni/index.html"
          : null;
    if (destination) window.location.replace(new URL(destination, document.baseURI).href);
  } catch {
    // Keep the login form available when session lookup is temporarily unavailable.
  }
}

redirectIfAuthenticated();

const loginStatus = document.querySelector("#login-status");
if (loginStatus && new URLSearchParams(window.location.search).get("notice") === "session-expired") {
  loginStatus.textContent = "Your session has expired. Please sign in again.";
}


const passwordToggle =
  document.querySelector("#toggle-password");

passwordToggle?.addEventListener("click", () => {
  const passwordInput =
    document.querySelector("#login-password");

  if (!passwordInput) return;

  const showPassword =
    passwordInput.type === "password";

  passwordInput.type =
    showPassword ? "text" : "password";

  const passwordIcon = passwordToggle.querySelector("i");
  passwordIcon?.classList.toggle("bx-show", !showPassword);
  passwordIcon?.classList.toggle("bx-hide", showPassword);

  passwordToggle.setAttribute(
    "aria-label",
    showPassword ? "Hide password" : "Show password"
  );

  passwordToggle.setAttribute(
    "aria-pressed",
    String(showPassword)
  );
});


form?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    const status =
      document.querySelector(
        "#login-status"
      );


    const submitButton =
      form.querySelector(
        'button[type="submit"]'
      );


    // --------------------------------------------------------
    // CLEAR PREVIOUS STATUS
    // --------------------------------------------------------

    if (status) {

      status.textContent =
        "Signing in...";

    }


    // --------------------------------------------------------
    // PREVENT DOUBLE SUBMISSION
    // --------------------------------------------------------

    if (submitButton) {

      submitButton.disabled =
        true;

    }


    try {

      // ------------------------------------------------------
      // COLLECT FORM DATA
      // ------------------------------------------------------

      const data =
        Object.fromEntries(
          new FormData(form)
        );


      const email =
        String(
          data.email || ""
        ).trim()
        .toLowerCase();


      const password =
        String(
          data.password || ""
        );


      // ------------------------------------------------------
      // VALIDATION
      // ------------------------------------------------------

      if (!email) {

        throw new Error(
          "Please enter your email address."
        );

      }


      if (!password) {

        throw new Error(
          "Please enter your password."
        );

      }


      // ------------------------------------------------------
      // LOGIN REQUEST
      // ------------------------------------------------------

      const response =
        await fetch(
          "/api/auth/login",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            credentials:
              "include",

            body:
              JSON.stringify({
                email,
                password
              })

          }
        );


      // ------------------------------------------------------
      // READ RESPONSE SAFELY
      // ------------------------------------------------------

      let result = {};


      try {

        result =
          await response.json();

      } catch {

        result = {};

      }


      // ------------------------------------------------------
      // LOGIN FAILED
      // ------------------------------------------------------

      if (!response.ok) {

        throw new Error(
          result.error ||
          "Login failed. Please check your details."
        );

      }


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      if (status) {

        status.textContent =
          "Login successful. Redirecting…";

      }


      // ------------------------------------------------------
      // ROLE-BASED REDIRECT
      // ------------------------------------------------------

      if (
        result.role === "ADMIN" ||
        result.role === "STAFF"
      ) {

        window.location.href =
          new URL("admin/", document.baseURI).href;

        return;

      }


      if (
        result.role === "STUDENT"
      ) {

        window.location.href =
          new URL("student/index.html", document.baseURI).href;

        return;

      }

      if (result.role === "ALUMNI") {
        window.location.href =
          new URL("alumni/index.html", document.baseURI).href;
        return;
      }


      // ------------------------------------------------------
      // UNKNOWN ROLE
      // ------------------------------------------------------

      throw new Error(
        "Your account does not have a valid portal role."
      );


    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      if (status) {

        status.textContent =
          error.message ||
          "Unable to sign in.";

      }


      // Re-enable button after failure.

      if (submitButton) {

        submitButton.disabled =
          false;

      }

    }

  }
);
