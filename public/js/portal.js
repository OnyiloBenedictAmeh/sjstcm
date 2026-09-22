"use strict";


// ============================================================
// LOGIN
// ============================================================

const form =
  document.querySelector(
    "#login-form"
  );


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
          "../admin/admin.html";

        return;

      }


      if (
        result.role === "STUDENT" ||
        result.role === "ALUMNI"
      ) {

        window.location.href =
          "../student/index.html";

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