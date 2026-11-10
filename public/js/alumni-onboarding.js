"use strict";

(() => {
  const form = document.querySelector("#alumni-onboarding-form");
  if (!form) return;
  const steps = [...form.querySelectorAll(".wizard-step")];
  const progress = [...document.querySelectorAll(".onboarding-steps li")];
  const back = document.querySelector("#back-step");
  const next = document.querySelector("#next-step");
  const error = document.querySelector("#wizard-error");
  const summary = document.querySelector("#review-summary");
  let current = 0;
  let accountPassword = "";
  const get = name => form.elements.namedItem(name);
  const val = name => String(get(name)?.value || "").trim();
  const showError = message => { error.textContent = message; error.hidden = !message; };

  function render() {
    steps.forEach((step, i) => { step.hidden = i !== current; });
    progress.forEach((item, i) => {
      if (i === current) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
      item.classList.toggle("complete", i < current);
    });
    document.querySelector("#step-count").textContent = `Step ${current + 1} of ${steps.length}`;
    back.hidden = current === 0;
    next.textContent = current === steps.length - 1 ? "Submit for verification" : "Continue";
    next.disabled = false;
    showError("");
    steps[current].querySelector("h2")?.focus({ preventScroll: true });
  }
  function validate() {
    for (const input of steps[current].querySelectorAll("input[required], input[pattern]")) {
      if (input.disabled || input.closest("[hidden]")) continue;
      if (!input.checkValidity()) { input.reportValidity(); return false; }
    }
    if (current === 0 && val("password") !== val("confirmPassword")) {
      showError("Those passwords do not match."); get("confirmPassword").focus(); return false;
    }
    if (current === 2 && !get("yearsUnknown").checked && val("entryYear") && val("exitYear") && Number(val("exitYear")) < Number(val("entryYear"))) {
      showError("Exit year must be the same as or later than entry year."); get("exitYear").focus(); return false;
    }
    if (current === 2 && !get("yearsUnknown").checked) {
      const maxYear = new Date().getFullYear() + 1;
      for (const name of ["entryYear", "exitYear"]) {
        const value = val(name);
        if (value && (Number(value) < 1900 || Number(value) > maxYear)) {
          showError("Enter a year from 1900 through " + maxYear + ", or mark the year as unknown.");
          get(name).focus();
          return false;
        }
      }
    }
    return true;
  }
  function review() {
    const rows = [
      ["Name", val("currentName")], ["Name while attending", val("schoolName")],
      ["Entry year", val("entryYear") || "Not provided"], ["Exit year", val("exitYear") || "Not provided"],
      ["Approximate period", val("approximatePeriod") || "Not provided"], ["Last class", val("lastClass")],
      ["Department", val("department")], ["Class / Set", val("classSet")],
      ["Profile", [val("occupation"), val("location"), val("biography")].filter(Boolean).join(" · ") || "Not provided"]
    ];
    summary.replaceChildren(...rows.flatMap(([k,v]) => { const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v||"Not provided";return [dt,dd]; }));
  }
  get("yearsUnknown")?.addEventListener("change", () => {
    document.querySelector("#exact-years").hidden = get("yearsUnknown").checked;
    document.querySelector("#approximate-period").hidden = !get("yearsUnknown").checked;
  });
  get("noEvidence")?.addEventListener("change", () => { get("evidenceFiles").disabled = true; });
  back.addEventListener("click", () => {
    current = Math.max(0, current - 1);
    if (current === 0 && accountPassword) {
      get("password").value = accountPassword;
      get("confirmPassword").value = accountPassword;
    }
    render();
  });
  next.addEventListener("click", async () => {
    if (!validate()) return;
    if (current < steps.length - 1) {
      if (current === 0) { accountPassword = val("password"); get("password").value = ""; get("confirmPassword").value = ""; }
      current++;
      if (current === steps.length - 1) review();
      render(); return;
    }
    if (get("profilePhoto").files.length || get("evidenceFiles").files.length) {
      showError("Photo and evidence uploads are not supported yet. Remove selected files to submit your registration."); return;
    }
    next.disabled = true; showError("");
    const payload = {
      email: val("email"), password: accountPassword, fullName: val("currentName"),
      schoolName: val("schoolName"), phone: val("phone"),
      entryYear: get("yearsUnknown").checked ? "" : val("entryYear"),
      exitYear: get("yearsUnknown").checked ? "" : val("exitYear"),
      approximatePeriod: val("approximatePeriod"), lastClass: val("lastClass"),
      department: val("department"), house: val("house"), classSet: val("classSet"),
      occupation: val("occupation"), location: val("location"), biography: val("biography"),
      publicName: document.querySelector("#public-name").checked,
      publicSchoolHistory: document.querySelector("#public-school-history").checked,
      publicOccupation: document.querySelector("#public-occupation").checked,
      publicLocation: document.querySelector("#public-occupation").checked,
      publicBiography: document.querySelector("#public-occupation").checked
    };
    try {
      const apiBase = window.location.hostname === "onyilobenedictameh.github.io" ? "https://sjstcm.vercel.app" : window.location.origin;
      const response = await fetch(new URL("/api/alumni/register", apiBase), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to submit registration.");
      form.hidden = true;
      document.querySelector(".onboarding-steps").hidden = true;
      document.querySelector(".onboarding-intro").hidden = true;
      const confirmation = document.querySelector("#registration-confirmation");
      confirmation.hidden = false;
      confirmation.querySelector(".reference-number")?.remove();
      confirmation.querySelector(".demo-note")?.remove();
      const message = confirmation.querySelector(".lead");
      message.textContent = result.message || "If this email can be registered, verification instructions will be sent. Your profile remains private until the school verifies it.";
      confirmation.querySelector("h2")?.focus({ preventScroll: true });
    } catch (e) { showError(e.message || "Unable to submit registration. Please try again."); next.disabled = false; }
  });
  form.addEventListener("submit", e => e.preventDefault());
  render();
})();
