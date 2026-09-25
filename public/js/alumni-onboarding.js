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

  const get = name => form.elements.namedItem(name);
  const val = name => String(get(name)?.value || "").trim();
  const showError = message => {
    error.textContent = message;
    error.hidden = !message;
  };

  function render() {
    steps.forEach((step, index) => { step.hidden = index !== current; });
    progress.forEach((item, index) => {
      if (index === current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.classList.toggle("complete", index < current);
    });
    document.querySelector("#step-count").textContent = `Step ${current + 1} of ${steps.length}`;
    back.hidden = current === 0;
    next.textContent = current === steps.length - 1 ? "Submit for verification" : "Continue";
    showError("");
    const heading = steps[current].querySelector("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }

  function validateCurrent() {
    const active = steps[current];
    for (const input of active.querySelectorAll("input[required], input[pattern]")) {
      if (input.disabled || input.closest("[hidden]")) continue;
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
    }
    if (current === 0 && val("password") !== val("confirmPassword")) {
      showError("Those passwords do not match. Please check them and try again.");
      get("confirmPassword").focus();
      return false;
    }
    if (current === 2 && !get("yearsUnknown").checked) {
      const entry = val("entryYear");
      const exit = val("exitYear");
      if (entry && exit && Number(exit) < Number(entry)) {
        showError("The exit year should be the same as or later than the entry year.");
        get("exitYear").focus();
        return false;
      }
    }
    return true;
  }

  function reviewRows() {
    const unknown = get("yearsUnknown").checked;
    const yearRows = unknown
      ? [["Approximate period", val("approximatePeriod") || "Not sure yet"]]
      : [["Entry year", val("entryYear") || "Not provided"], ["Exit / graduation year", val("exitYear") || "Not provided"]];
    const photo = get("profilePhoto").files[0]?.name || "Not provided";
    const evidence = get("evidenceFiles").files;
    const profile = [val("occupation"), val("location"), val("biography")].filter(Boolean).join(" · ") || "Not provided";
    const rows = [
      ["Name", val("currentName")], ["Name while attending school", val("schoolName")],
      ...yearRows, ["Class / Set", val("classSet") || (val("exitYear") ? `${val("exitYear")} Set` : "Not provided")],
      ["Last class", val("lastClass")], ["Department / Programme", val("department")], ["House", val("house")],
      ["Admission / session", val("admissionSession")], ["Profile information", profile],
      ["Profile photo", photo], ["Evidence", get("noEvidence").checked ? "No documents available" : evidence.length ? `${evidence.length} file(s) selected for verification only` : "None selected"]
    ];
    summary.replaceChildren(...rows.map(([label, value]) => {
      const fragment = document.createDocumentFragment();
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      fragment.append(dt, dd);
      return fragment;
    }));
  }

  get("yearsUnknown").addEventListener("change", event => {
    const unknown = event.currentTarget.checked;
    document.querySelector("#exact-years").hidden = unknown;
    document.querySelector("#approximate-period").hidden = !unknown;
  });
  get("noEvidence").addEventListener("change", event => {
    get("evidenceFiles").disabled = event.currentTarget.checked;
  });
  back.addEventListener("click", () => { if (current > 0) current -= 1; render(); });
  next.addEventListener("click", () => {
    if (!validateCurrent()) return;
    if (current < steps.length - 1) {
      if (current === 0) {
        // Never retain credentials in demo state after demonstrating account creation.
        get("password").value = "";
        get("confirmPassword").value = "";
      }
      current += 1;
      if (current === steps.length - 1) reviewRows();
      render();
      return;
    }
    form.hidden = true;
    document.querySelector(".onboarding-steps").hidden = true;
    document.querySelector(".onboarding-intro").hidden = true;
    document.querySelector("#registration-confirmation").hidden = false;
    const confirmationHeading = document.querySelector("#registration-confirmation h2");
    confirmationHeading.setAttribute("tabindex", "-1");
    confirmationHeading.focus({ preventScroll: true });
  });
  form.addEventListener("submit", event => event.preventDefault());
  render();
})();
