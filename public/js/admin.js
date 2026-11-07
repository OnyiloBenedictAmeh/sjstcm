// ============================================================
// SCHOOL DIGITAL PLATFORM
// ADMIN DASHBOARD
// ============================================================

"use strict";


// ============================================================
// HELPERS
// ============================================================

const $ = selector => document.querySelector(selector);

const $$ = selector => [
  ...document.querySelectorAll(selector)
];


function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatDate(value) {

  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHTML(value);
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


function formatDateTime(value) {

  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHTML(value);
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}


function studentFullName(student) {

  return [
    student?.firstName,
    student?.middleName,
    student?.lastName
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}


function showToast(message, type = "success") {

  const toast =
    $("#toast") ||
    $("#admin-toast");

  if (!toast) return;

  toast.textContent = message;

  toast.className =
    `toast show ${type}`;

  clearTimeout(showToast.timer);

  showToast.timer =
    setTimeout(() => {
      toast.className = "toast";
    }, 3500);
}


function setMessage(
  selector,
  message,
  type = ""
) {

  const element = $(selector);

  if (!element) return;

  element.textContent = message;

  element.className =
    `form-status ${type}`;
}


function setElementText(selector, value) {

  const element = $(selector);

  if (!element) return;

  element.textContent = value;
}


function setHTML(selector, html) {

  const element = $(selector);

  if (!element) return;

  element.innerHTML = html;
}


// ============================================================
// API
// ============================================================

async function api(url, options = {}) {

  const config = {
    credentials: "include",
    ...options,

    headers: {
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type":
              "application/json"
          }),

      ...(options.headers || {})
    }
  };


  const response =
    await fetch(url, config);


  let data = {};


  try {

    data = await response.json();

  } catch {

    data = {};

  }


  if (response.status === 401) {

    window.location.href =
      "admin/login.html";

    throw new Error(
      "Authentication required"
    );
  }


  if (response.status === 403) {

    showLockedDoor();

    throw new Error(
      "You do not have permission to perform this action."
    );
  }


  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }


  return data;
}


const permittedAreaDefinitions = [
  { keys: ["STUDENTS_VIEW", "STUDENTS_MANAGE"], title: "Students", icon: "👨‍🎓", section: "students" },
  { keys: ["ACADEMICS_VIEW", "ACADEMICS_MANAGE", "RESULTS_REVIEW"], title: "Academic Records", icon: "📚", section: "academics" },
  { keys: ["ALUMNI_VIEW", "ALUMNI_VERIFY", "ALUMNI_MANAGE"], title: "Alumni", icon: "📖", section: "alumni" },
  { keys: ["CONTENT_VIEW", "CONTENT_MANAGE"], title: "News and Content", icon: "📰", section: "news" },
  { keys: ["EVENTS_MANAGE"], title: "Events", icon: "📅", section: "events" },
  { keys: ["GALLERY_MANAGE"], title: "Gallery", icon: "📸", section: "gallery" },
  { keys: ["SYSTEM_MANAGE"], title: "System Access", icon: "⚙️", section: null }
];

function renderPermittedAreas() {
  const container = $("#permitted-areas-list");
  if (!container || !currentUser) return;

  const permissions = new Set(currentUser.permissions || []);
  const areas = permittedAreaDefinitions.filter(area =>
    area.keys.some(key => permissions.has(key))
  );

  if (!areas.length) {
    container.innerHTML = '<p class="permitted-areas-empty">No additional areas are assigned to your account.</p>';
    return;
  }

  container.innerHTML = areas.map(area => `
    <button class="permitted-area-card" type="button" ${area.section ? `data-permitted-section="${area.section}"` : "disabled"}>
      <span aria-hidden="true">${area.icon}</span>
      <strong>${escapeHTML(area.title)}</strong>
      <span class="permitted-area-open">${area.section ? "Open area →" : "Available"}</span>
    </button>
  `).join("");

  container.querySelectorAll("[data-permitted-section]").forEach(button => {
    button.addEventListener("click", () => openSection(button.dataset.permittedSection));
  });
}

function showLockedDoor() {
  if (document.querySelector("#locked-door")) return;

  const door = document.createElement("div");
  door.id = "locked-door";
  door.className = "locked-door-backdrop";
  door.innerHTML = `
    <section class="locked-door-card" role="dialog" aria-modal="true" aria-labelledby="locked-door-title">
      <div class="locked-door-icon" aria-hidden="true">🚪 🔒</div>
      <h2 id="locked-door-title">This door is locked</h2>
      <p>You don’t currently have access to this area of the portal.</p>
      <div class="locked-door-actions">
        <button class="button" type="button" data-door-areas>Take Me to My Permitted Areas</button>
        <button class="button secondary" type="button" data-door-dashboard>Return to Dashboard</button>
      </div>
    </section>`;
  document.body.append(door);

  door.querySelector("[data-door-areas]").addEventListener("click", () => {
    door.remove();
    openSection("overview");
    $("#permitted-areas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#permitted-areas-list")?.querySelector("button")?.focus({ preventScroll: true });
  });
  door.querySelector("[data-door-dashboard]").addEventListener("click", () => {
    door.remove();
    openSection("overview");
  });
  door.addEventListener("click", event => {
    if (event.target === door) door.remove();
  });
}


// ============================================================
// CURRENT USER
// ============================================================

let currentUser = null;


async function loadCurrentUser() {

  currentUser =
    await api("/api/auth/me");

  if ($("#create-alumni")) $("#create-alumni").hidden = !alumniCan("ALUMNI_MANAGE");
  if ($("#create-class-set")) $("#create-class-set").hidden = !alumniCan("ALUMNI_MANAGE");
  const requestNav = document.querySelector('[data-section="requests"]');
  if (requestNav) requestNav.hidden = !alumniCan("ALUMNI_VERIFY");
  if ($("#section-requests")) $("#section-requests").hidden = !alumniCan("ALUMNI_VERIFY");
  if ($("#section-alumni")) $("#section-alumni").hidden = !alumniCan("ALUMNI_VIEW");

  const canStudentsView = alumniCan("STUDENTS_VIEW") || alumniCan("STUDENTS_MANAGE");
  const canStudentsManage = alumniCan("STUDENTS_MANAGE");
  const canAcademicsView = alumniCan("ACADEMICS_VIEW") || alumniCan("ACADEMICS_MANAGE");
  const canAcademicsManage = alumniCan("ACADEMICS_MANAGE");
  for (const [section, allowed] of [["students", canStudentsView], ["academics", canAcademicsView]]) {
    const nav = document.querySelector('[data-section="' + section + '"]');
    const panel = document.getElementById("section-" + section);
    if (nav) nav.hidden = !allowed;
    if (panel) panel.hidden = !allowed;
    const quick = document.querySelector('[data-section-target="' + section + '"]');
    if (quick) quick.hidden = !allowed;
  }
  if ($("#add-student-button")) $("#add-student-button").hidden = !canStudentsManage;
  if ($("#add-class-btn")) $("#add-class-btn").hidden = !canAcademicsManage;
  if ($("#edit-class-btn")) $("#edit-class-btn").hidden = !canAcademicsManage;
  if ($("#add-class-student-btn")) $("#add-class-student-btn").hidden = !canStudentsManage;
  if ($("#new-session-button")) $("#new-session-button").hidden = !canAcademicsManage;

  renderPermittedAreas();


  if (
    !["ADMIN", "STAFF"]
      .includes(currentUser.role)
  ) {

    window.location.href =
      "student/index.html";

    return;
  }


  const name =
    currentUser.student
      ? studentFullName(currentUser.student)

      : currentUser.alumni?.student
        ? studentFullName(
            currentUser.alumni.student
          )

        : currentUser.email;


  const displayName =
    name || "Administrator";


  // ----------------------------------------------------------
  // SIDEBAR
  // ----------------------------------------------------------

  setElementText(
    "#sidebar-user-name",
    displayName
  );


  setElementText(
    "#sidebar-user-role",
    currentUser.role || "ADMIN"
  );


  // ----------------------------------------------------------
  // TOPBAR
  // ----------------------------------------------------------

  setElementText(
    "#topbar-user-name",
    displayName
  );


  setElementText(
    "#topbar-user-email",
    currentUser.email || "—"
  );


  // ----------------------------------------------------------
  // AVATARS
  // ----------------------------------------------------------

  const avatar =
    displayName
      .trim()
      .charAt(0)
      .toUpperCase() || "A";


  setElementText(
    "#sidebar-avatar",
    avatar
  );


  setElementText(
    "#topbar-avatar",
    avatar
  );


  // ----------------------------------------------------------
  // OVERVIEW ACCOUNT
  // ----------------------------------------------------------

  setElementText(
    "#account-name",
    displayName
  );


  setElementText(
    "#account-email",
    currentUser.email || "—"
  );


  setElementText(
    "#account-role",
    currentUser.role || "—"
  );
}


// ============================================================
// NAVIGATION
// ============================================================

const sectionInfo = {

  overview: {
    title: "Overview"
  },

  students: {
    title: "Students"
  },

  academics: {
    title: "Academics"
  },

  alumni: {
    title: "Alumni"
  },

  requests: {
    title: "Update Requests"
  },

  news: {
    title: "News"
  },

  events: {
    title: "Events"
  },

  gallery: {
    title: "Gallery"
  },

  departments: {
    title: "Departments"
  },

  messages: {
    title: "Messages"
  }

};


function openSection(section) {

  if (!sectionInfo[section]) return;

  if (section === "students" && !alumniCan("STUDENTS_VIEW") && !alumniCan("STUDENTS_MANAGE")) {
    showLockedDoor();
    return;
  }
  if (section === "academics" && !alumniCan("ACADEMICS_VIEW") && !alumniCan("ACADEMICS_MANAGE")) {
    showLockedDoor();
    return;
  }


  $$(".admin-section")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.id ===
          `section-${section}`
      );

    });


  $$(".admin-nav-item")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.section === section
      );

    });


  setElementText(
    "#page-title",
    sectionInfo[section].title
  );


  $("#admin-sidebar")
    ?.classList.remove("open");


  $("#sidebar-overlay")
    ?.classList.remove("show");


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ------------------------------------------------------------
// SIDEBAR NAVIGATION
// ------------------------------------------------------------

$$(".admin-nav-item")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        openSection(
          button.dataset.section
        );

      }
    );

  });


// ------------------------------------------------------------
// QUICK ACTIONS
// ------------------------------------------------------------

$$("[data-section-target]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        openSection(
          button.dataset.sectionTarget
        );

      }
    );

  });


// ------------------------------------------------------------
// MOBILE MENU
// ------------------------------------------------------------

$("#mobile-menu-button")
  ?.addEventListener(
    "click",
    () => {

      $("#admin-sidebar")
        ?.classList.toggle("open");

      $("#sidebar-overlay")
        ?.classList.toggle("show");

    }
  );


$("#sidebar-overlay")
  ?.addEventListener(
    "click",
    () => {

      $("#admin-sidebar")
        ?.classList.remove("open");

      $("#sidebar-overlay")
        ?.classList.remove("show");

    }
  );


// ============================================================
// OVERVIEW
// ============================================================

function showRetryState(selector, message, loader) {
  setHTML(selector, '<div class="load-error"><p>' + escapeHTML(message) + '</p><button class="button secondary" type="button" data-retry-loader="' + escapeHTML(loader) + '">Retry</button></div>');
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-retry-loader]");
  if (!button) return;
  const loaders = { overview: loadOverview, students: () => loadStudents($("#student-search")?.value.trim() || "", studentPage), overviewStudents: loadOverviewStudents, academics: loadAcademics, classes: loadClasses };
  loaders[button.dataset.retryLoader]?.();
});

async function loadOverview() {

  try {

    const overview =
      await api("/api/admin/overview");


    const stats = [
      { label: "Total students", value: overview.students, icon: "bx bx-group" },
      { label: "Active students", value: overview.activeStudents, icon: "bx bx-user-check" },
      { label: "Currently enrolled", value: overview.currentlyEnrolled, icon: "bx bx-id-card" },
      { label: "Classes", value: overview.classes, icon: "bx bx-building" },
      { label: "Alumni", value: overview.alumni, icon: "bx bx-user-voice" },
      { label: "News articles (including drafts)", value: overview.news, icon: "bx bx-news" },
      { label: "Events (all dates)", value: overview.events, icon: "bx bx-calendar-event" },
      { label: "Unread messages", value: overview.unreadMessages, icon: "bx bx-envelope" },
      { label: "Pending requests", value: overview.pendingUpdateRequests, icon: "bx bx-time-five" }
    ].filter(item => item.value !== null && item.value !== undefined);


    setHTML(
      "#stats",
      stats.map(item => `

        <article class="stat-card">

          <div class="stat-icon">
            <i class="${item.icon}" aria-hidden="true"></i>
          </div>

          <div>

            <span>
              ${escapeHTML(item.label)}
            </span>

            <strong>
              ${Number(item.value || 0)}
            </strong>

          </div>

        </article>

      `).join("")
    );


    const sessions = overview.sessions || [];
    setHTML("#overview-sessions", sessions.length
      ? sessions.slice(0, 5).map(item => '<div class="compact-row"><span><strong>' + escapeHTML(item.name) + '</strong><small>' + (item.startDate ? formatDate(item.startDate) : "Dates not set") + (item.endDate ? " – " + formatDate(item.endDate) : "") + '</small></span><span class="status-badge ' + (item.isCurrent ? "active" : "") + '">' + (item.isCurrent ? "Current" : "Inactive") + '</span></div>').join("")
      : '<div class="empty-state">No academic sessions found.</div>');
    setHTML("#overview-classes", overview.classSummary?.length
      ? overview.classSummary.map(item => '<div class="compact-row"><span>' + escapeHTML(item.name) + (item.level ? '<small>' + escapeHTML(item.level) + '</small>' : "") + '</span><strong>' + Number(item._count?.enrollments || 0) + ' enrolled</strong></div>').join("")
      : overview.classes === null ? '<div class="empty-state">Academic summary is not available to this account.</div>' : '<div class="empty-state">No classes found.</div>');

    setElementText(
      "#request-count",
      Number(
        overview.pendingUpdateRequests || 0
      )
    );


    setElementText(
      "#message-count",
      Number(
        overview.unreadMessages || 0
      )
    );


  } catch (error) {

    console.error(
      "LOAD OVERVIEW ERROR:",
      error
    );

    showRetryState("#stats", error.message || "Dashboard statistics could not be loaded.", "overview");
    showRetryState("#overview-sessions", "Session summary could not be loaded.", "overview");
    showRetryState("#overview-classes", "Class summary could not be loaded.", "overview");
    throw error;

  }
}


// ============================================================
// STUDENTS
// ============================================================

let studentSearchTimer = null;
let studentPage = 1;


async function loadStudents(query = "", page = studentPage) {

  const table =
    $("#students-table-body");

  if (!table) return;


  table.innerHTML = `

    <tr>

      <td
        colspan="6"
        class="table-empty"
      >
        Loading students...
      </td>

    </tr>

  `;


  try {

    studentPage = Math.max(1, Number(page) || 1);
    const params = new URLSearchParams({ q: query, page: String(studentPage), pageSize: "50" });
    const filters = { status: $("#student-status-filter")?.value, classId: $("#student-class-filter")?.value, sessionId: $("#student-session-filter")?.value, enrollmentStatus: $("#student-enrollment-filter")?.value };
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const result = await api(`/api/admin/students?${params}`);
    const students = Array.isArray(result) ? result : (result.items || []);


    setElementText(
      "#student-count",
      `${Number(result.total ?? students.length)} student${
        Number(result.total ?? students.length) === 1
          ? ""
          : "s"
      }`
    );


    if (!students.length) {

      table.innerHTML = `

        <tr>

          <td
            colspan="6"
            class="table-empty"
          >
            No students found.
          </td>

        </tr>

      `;

      return;
    }


    table.innerHTML =
      students.map(student => {

        const enrollment = student.enrollments?.find(item => item.session?.isCurrent && item.status === "ENROLLED") || student.enrollments?.[0];


        const fullName =
          studentFullName(student);


        return `

          <tr>

            <td>

              <strong class="student-id">

                ${escapeHTML(
                  student.studentId
                )}

              </strong>

            </td>


            <td>

              <strong>

                ${escapeHTML(
                  fullName
                )}

              </strong>

            </td>


            <td>

              <span
                class="status-badge ${String(
                  student.status || ""
                ).toLowerCase()}"
              >

                ${escapeHTML(
                  student.status || "—"
                )}

              </span>

            </td>


            <td>

              ${escapeHTML(
                enrollment?.class?.name ||
                "—"
              )}

            </td>


            <td>

              ${escapeHTML(
                enrollment?.session?.name ||
                "—"
              )}

            </td>


            <td>

              <button
                type="button"
                class="table-action"
                data-student-id="${escapeHTML(
                  student.id
                )}"
                data-action="edit-student"
              >
                Edit
              </button>
              <button type="button" class="table-action" data-student-id="${escapeHTML(student.id)}" data-action="view-student">Profile</button>

            </td>

          </tr>

        `;

      }).join("");


    $$("[data-action='edit-student']")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const student =
              students.find(
                item =>
                  item.id ===
                  button.dataset.studentId
              );


            api(`/api/admin/students/${encodeURIComponent(button.dataset.studentId)}`).then(openStudentEditor).catch(error => showToast(error.message, "error"));

          }
        );

      });

    $$("[data-action='view-student']").forEach(button => button.addEventListener("click", () => openAdminStudentProfile(button.dataset.studentId)));
    const pagination = $("#student-pagination");
    if (pagination) pagination.innerHTML = Number(result.pages || 1) > 1 ? `<button class="button secondary" type="button" data-page="${studentPage - 1}" ${studentPage <= 1 ? "disabled" : ""}>Previous</button><span>Page ${studentPage} of ${result.pages}</span><button class="button secondary" type="button" data-page="${studentPage + 1}" ${studentPage >= result.pages ? "disabled" : ""}>Next</button>` : "";
    pagination?.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => loadStudents(query, Number(button.dataset.page))));


  } catch (error) {

    table.innerHTML = `

      <tr>

        <td
          colspan="6"
          class="table-empty error-text"
        >

          ${escapeHTML(error.message)} <button type="button" class="button secondary" data-retry="students">Retry</button>

        </td>

      </tr>

    `;

  }
}


// ============================================================
// STUDENT FORM OPTIONS
// ============================================================

async function loadStudentFormOptions() {

  try {

    const { classes = [], sessions = [] } = await api("/api/admin/students/enrollment-options");


    const classSelect =
      $("#new-student-class");


    const sessionSelect =
      $("#new-student-session");


    if (classSelect) {

      classSelect.innerHTML = `

        <option value="">
          No class
        </option>

        ${classes.map(item => `

          <option
            value="${escapeHTML(item.id)}"
          >

            ${escapeHTML(item.name)}

          </option>

        `).join("")}

      `;

    }


    if (sessionSelect) {

      sessionSelect.innerHTML = `

        <option value="">
          No session
        </option>

        ${sessions.map(item => `

          <option
            value="${escapeHTML(item.id)}"
          >

            ${escapeHTML(item.name)}

          </option>

        `).join("")}

      `;

    }


    window.adminClasses =
      classes;

    window.adminSessions =
      sessions;

    const fill = (selector, rows, label) => { const select = $(selector); if (select) select.innerHTML = `<option value="">${label}</option>` + rows.map(row => `<option value="${escapeHTML(row.id)}">${escapeHTML(row.name)}</option>`).join(""); };
    fill("#student-class-filter", classes, "All classes");
    fill("#student-session-filter", sessions, "All sessions");
    fill("#class-session-filter", sessions, "Current session");


  } catch (error) {

    console.error(
      "LOAD STUDENT OPTIONS ERROR:",
      error
    );

  }
}


// ============================================================
// ADD STUDENT MODAL
// ============================================================

function openStudentForm() {

  const modal =
    $("#add-student-modal");


  const form =
    $("#add-student-form");


  if (!modal || !form) return;


  form.reset();


  setMessage(
    "#add-student-status",
    ""
  );


  const preview =
    $("#student-photo-preview");


  if (preview) {

    preview.innerHTML = `

      <span>📷</span>

      <small>
        No photograph selected
      </small>

    `;

  }


  modal.classList.remove("hidden");

  modal.hidden = false;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function closeStudentForm() {

  const modal =
    $("#add-student-modal");


  if (!modal) return;


  modal.classList.add("hidden");

  modal.hidden = true;
}


$("#add-student-button")
  ?.addEventListener(
    "click",
    openStudentForm
  );


$("#close-add-student")
  ?.addEventListener(
    "click",
    closeStudentForm
  );


$("#cancel-add-student")
  ?.addEventListener(
    "click",
    closeStudentForm
  );


// ============================================================
// ADD STUDENT
// ============================================================

$("#add-student-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const form =
        event.currentTarget;


      const formData =
        new FormData(form);


      if (!formData.get("classId")) {
        formData.delete("classId");
      }


      if (!formData.get("sessionId")) {
        formData.delete("sessionId");
      }


      try {

        setMessage(
          "#add-student-status",
          "Creating student..."
        );


        const response =
          await fetch(
            "/api/admin/students",
            {
              method: "POST",
              credentials: "include",
              body: formData
            }
          );


        let result = {};


        try {

          result =
            await response.json();

        } catch {

          result = {};

        }


        if (response.status === 401) {

          window.location.href =
            "admin/login.html";

          return;
        }

        if (response.status === 403) {
          showLockedDoor();
          throw new Error("You do not have access to this area.");
        }


        if (!response.ok) {

          throw new Error(
            result.error ||
            "Unable to create student."
          );

        }


        setMessage(
          "#add-student-status",
          "Student created successfully.",
          "success"
        );


        showToast(
          "Student created successfully."
        );


        form.reset();


        const preview =
          $("#student-photo-preview");


        if (preview) {

          preview.innerHTML = `

            <span>📷</span>

            <small>
              No photograph selected
            </small>

          `;

        }


        closeStudentForm();


        await Promise.all([

          loadStudents(
            $("#student-search")
              ?.value
              ?.trim() || ""
          ),

          loadOverview(),

          loadClasses()

        ]);


      } catch (error) {

        setMessage(
          "#add-student-status",
          error.message,
          "error"
        );

      }

    }
  );


// ============================================================
// STUDENT PHOTO PREVIEW
// ============================================================

$("#student-photo")
  ?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];


      const preview =
        $("#student-photo-preview");


      if (!preview) return;


      if (!file) {

        preview.innerHTML = `

          <span>📷</span>

          <small>
            No photograph selected
          </small>

        `;

        return;
      }


      if (file.size > 4 * 1024 * 1024) {

        preview.innerHTML = `

          <span>⚠️</span>

          <small>
            Image is larger than 4 MiB
          </small>

        `;


        event.target.value = "";

        return;
      }


      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp"
        ].includes(file.type)
      ) {

        preview.innerHTML = `

          <span>⚠️</span>

          <small>
            Please select JPG, PNG or WebP
          </small>

        `;


        event.target.value = "";

        return;
      }


      const url =
        URL.createObjectURL(file);


      preview.innerHTML = `

        <img
          src="${url}"
          alt="Student photograph preview"
        >

        <small>
          ${escapeHTML(file.name)}
        </small>

      `;

    }
  );


// ============================================================
// STUDENT EDITOR
// ============================================================

function openStudentEditor(student) {

  const modal =
    $("#student-modal");


  if (!modal) {

    showToast(
      "Student editor is unavailable.",
      "error"
    );

    return;
  }


  // ----------------------------------------------------------
  // Populate edit modal
  // ----------------------------------------------------------

  setElementText(
    "#student-modal-title",
    "Edit student"
  );


  const fields = {

    "#student-id":
      student.id,

    "#student-student-id":
      student.studentId,

    "#student-first-name":
      student.firstName || "",

    "#student-middle-name":
      student.middleName || "",

    "#student-last-name":
      student.lastName || "",

    "#student-email":
      student.email || "",

    "#student-phone":
      student.phone || "",

    "#student-gender":
      student.gender || "",

    "#student-address":
      student.address || "",

    "#student-status":
      student.status || "ACTIVE",

    "#student-photo-url":
      student.photoUrl || ""

  };


  Object.entries(fields)
    .forEach(([selector, value]) => {

      const element =
        $(selector);

      if (!element) return;

      element.value =
        value ?? "";

    });


  modal.classList.remove("hidden");

  modal.hidden = false;

  modal.dataset.studentId =
    student.id;
}


function closeStudentEditor() {

  const modal =
    $("#student-modal");

  if (!modal) return;

  modal.classList.add("hidden");

  modal.hidden = true;
}


$("#close-student-modal")
  ?.addEventListener(
    "click",
    closeStudentEditor
  );


$("#cancel-student")
  ?.addEventListener(
    "click",
    closeStudentEditor
  );


// ============================================================
// UPDATE STUDENT
// ============================================================

$("#student-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const form =
        event.currentTarget;


      const id =
        $("#student-id")?.value ||
        form.dataset.studentId;


      if (!id) {

        showToast(
          "Student ID is missing.",
          "error"
        );

        return;
      }


      const data = {

        firstName:
          $("#student-first-name")
            ?.value
            ?.trim(),

        middleName:
          $("#student-middle-name")
            ?.value
            ?.trim() || null,

        lastName:
          $("#student-last-name")
            ?.value
            ?.trim(),

        email:
          $("#student-email")
            ?.value
            ?.trim() || null,

        phone:
          $("#student-phone")
            ?.value
            ?.trim() || null,

        gender:
          $("#student-gender")
            ?.value
            ?.trim() || null,

        address:
          $("#student-address")
            ?.value
            ?.trim() || null,

        status:
          $("#student-status")
            ?.value
            ?.trim()
            .toUpperCase(),

        photoUrl:
          $("#student-photo-url")
            ?.value
            ?.trim() || null

      };


      try {

        setMessage(
          "#student-form-status",
          "Saving changes..."
        );


        await api(
          `/api/admin/students/${encodeURIComponent(id)}`,
          {
            method: "PUT",
            body:
              JSON.stringify(data)
          }
        );


        setMessage(
          "#student-form-status",
          "Student updated successfully.",
          "success"
        );


        showToast(
          "Student updated successfully."
        );


        closeStudentEditor();


        await Promise.all([

          loadStudents(
            $("#student-search")
              ?.value
              ?.trim() || ""
          ),

          loadOverview(),

          refreshSelectedClass()

        ]);


      } catch (error) {

        setMessage(
          "#student-form-status",
          error.message,
          "error"
        );

      }

    }
  );


// ============================================================
// STUDENT SEARCH
// ============================================================

$("#student-search")
  ?.addEventListener(
    "input",
    event => {

      clearTimeout(
        studentSearchTimer
      );


      studentSearchTimer =
        setTimeout(
          () => {

            studentPage = 1;
            loadStudents(event.target.value.trim(), studentPage);

          },
          300
        );

    }
  );

["#student-status-filter", "#student-class-filter", "#student-session-filter", "#student-enrollment-filter"].forEach(selector => $(selector)?.addEventListener("change", () => { studentPage = 1; loadStudents($("#student-search")?.value.trim() || "", studentPage); }));
$("#class-session-filter")?.addEventListener("change", () => loadClasses());
$("#refresh-classes")?.addEventListener("click", () => loadClasses().then(() => showToast("Classes refreshed.")).catch(error => showToast(error.message, "error")));
$("#students-table-body")?.addEventListener("click", event => { if (event.target.closest("[data-retry='students']")) loadStudents($("#student-search")?.value || "", studentPage); });
$("#classes-grid")?.addEventListener("click", event => { if (event.target.closest("[data-retry='classes']")) loadClasses(); });


// ============================================================
// ACADEMICS
// ============================================================

function sessionFormClose() { $("#session-form-panel")?.classList.add("hidden"); $("#session-form")?.reset(); $("#session-form")?.elements.namedItem("id") && ($("#session-form").elements.namedItem("id").value = ""); setMessage("#session-form-status", ""); }
function sessionFormOpen(item = null) {
  const form = $("#session-form"); if (!form) return;
  form.reset(); form.elements.namedItem("id").value = item?.id || ""; form.elements.namedItem("name").value = item?.name || "";
  form.elements.namedItem("startDate").value = item?.startDate ? new Date(item.startDate).toISOString().slice(0, 10) : "";
  form.elements.namedItem("endDate").value = item?.endDate ? new Date(item.endDate).toISOString().slice(0, 10) : "";
  form.elements.namedItem("isCurrent").checked = Boolean(item?.isCurrent); setElementText("#session-form-title", item ? "Edit academic session" : "Create academic session");
  $("#session-form-panel")?.classList.remove("hidden");
}
async function editSession(id) { try { sessionFormOpen(await api(`/api/admin/sessions/${encodeURIComponent(id)}`)); } catch (error) { showToast(error.message, "error"); } }
async function setCurrentSession(id) { try { await api(`/api/admin/sessions/${encodeURIComponent(id)}/current`, { method: "PATCH", body: "{}" }); showToast("Current session updated."); await Promise.all([loadAcademics(), loadClasses(), loadOverview()]); } catch (error) { showToast(error.message, "error"); } }
async function deleteSession(id) { if (!window.confirm("Delete this academic session? Sessions with history cannot be deleted.")) return; try { await api(`/api/admin/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }); showToast("Session deleted."); await Promise.all([loadAcademics(), loadClasses(), loadOverview()]); } catch (error) { showToast(error.message, "error"); } }

$("#new-session-button")?.addEventListener("click", () => sessionFormOpen());
$("#refresh-sessions")?.addEventListener("click", () => loadAcademics().then(() => showToast("Sessions refreshed.")).catch(error => showToast(error.message, "error")));
$("#close-session-form")?.addEventListener("click", sessionFormClose);
$("#cancel-session")?.addEventListener("click", sessionFormClose);
$("#session-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.isCurrent = form.elements.namedItem("isCurrent").checked;
  try { setMessage("#session-form-status", "Saving session…"); const id = data.id; delete data.id; await api(id ? `/api/admin/sessions/${encodeURIComponent(id)}` : "/api/admin/sessions", { method: id ? "PUT" : "POST", body: JSON.stringify(data) }); sessionFormClose(); showToast("Session saved."); await Promise.all([loadAcademics(), loadClasses(), loadOverview()]); }
  catch (error) { setMessage("#session-form-status", error.message, "error"); }
});

$("#student-profile-admin-modal")?.addEventListener("click", event => { if (event.target.id === "student-profile-admin-modal" || event.target.id === "close-student-profile-admin") $("#student-profile-admin-modal").classList.add("hidden"); });
async function openAdminStudentProfile(id) {
  const modal = $("#student-profile-admin-modal"), content = $("#student-profile-admin-content"); if (!modal || !content) return;
  modal.classList.remove("hidden"); content.innerHTML = '<p class="loading-state">Loading student record…</p>';
  try {
    const student = await api(`/api/admin/students/${encodeURIComponent(id)}`); setElementText("#student-profile-admin-title", `${studentFullName(student)} · ${student.studentId}`);
    const opts = window.adminClasses || []; const sessions = window.adminSessions || [];
    const enrollment = student.currentEnrollment;
    content.innerHTML = `<div class="student-profile-summary">${student.photoUrl ? `<img src="${escapeHTML(student.photoUrl)}" alt="Student photograph">` : ""}<div><p><strong>Status:</strong> ${escapeHTML(student.status)}</p><p><strong>Email:</strong> ${escapeHTML(student.email || "—")}</p><p><strong>Phone:</strong> ${escapeHTML(student.phone || "—")}</p><p><strong>Portal account:</strong> ${student.hasPortalAccount ? "Linked" : "Not linked"}</p><p><strong>Current enrollment:</strong> ${enrollment ? `${escapeHTML(enrollment.class.name)} · ${escapeHTML(enrollment.session.name)}` : "None"}</p></div></div><h3>Enrollment history</h3>${student.enrollments.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Session</th><th>Class</th><th>Status</th><th></th></tr></thead><tbody>${student.enrollments.map(e => `<tr><td>${escapeHTML(e.session.name)}</td><td>${escapeHTML(e.class.name)}</td><td>${escapeHTML(e.status)}${e.session.isCurrent && e.status === "ENROLLED" ? " · Current" : ""}</td><td>${alumniCan("STUDENTS_MANAGE") ? `<select data-enrollment-status="${escapeHTML(e.id)}">${["ENROLLED","PROMOTED","COMPLETED","WITHDRAWN"].map(s => `<option ${s === e.status ? "selected" : ""}>${s}</option>`).join("")}</select><button class="button secondary" data-save-enrollment="${escapeHTML(e.id)}">Save</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No enrollment history.</p>'}${alumniCan("STUDENTS_MANAGE") ? `<h3>Add enrollment</h3><form id="admin-enrollment-form" class="form-grid"><label>Class<select name="classId" required><option value="">Select class</option>${opts.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("")}</select></label><label>Session<select name="sessionId" required><option value="">Select session</option>${sessions.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("")}</select></label><label>Status<select name="status">${["ENROLLED","PROMOTED","COMPLETED","WITHDRAWN"].map(x => `<option>${x}</option>`).join("")}</select></label><button class="button" type="submit">Add enrollment</button></form>${enrollment ? `<h3>Record transfer</h3><form id="admin-transfer-form" class="form-grid"><input type="hidden" name="enrollmentId" value="${escapeHTML(enrollment.id)}"><label>New class<select name="classId" required><option value="">Select class</option>${opts.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("")}</select></label><label>New session<select name="sessionId" required><option value="">Select session</option>${sessions.filter(x => x.id !== enrollment.sessionId).map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("")}</select></label><button class="button secondary" type="submit">Record transfer</button></form>` : ""}` : ""}${student.academicRecords ? `<h3>Academic records</h3>${student.academicRecords.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Session</th><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead><tbody>${student.academicRecords.map(r => `<tr><td>${escapeHTML(r.session.name)}</td><td>${escapeHTML(r.subject)}</td><td>${escapeHTML(r.caScore ?? "—")}</td><td>${escapeHTML(r.examScore ?? "—")}</td><td>${escapeHTML(r.totalScore ?? "—")}</td><td>${escapeHTML(r.grade ?? "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No academic records.</p>'} ` : ""}<p id="profile-operation-status" class="form-status" role="status"></p>`;
    $("#admin-enrollment-form")?.addEventListener("submit", async ev => { ev.preventDefault(); try { await api(`/api/admin/students/${encodeURIComponent(id)}/enrollments`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget))) }); showToast("Enrollment added."); await openAdminStudentProfile(id); await loadStudents($("#student-search")?.value || "", studentPage); } catch (error) { setMessage("#profile-operation-status", error.message, "error"); } });
    $("#admin-transfer-form")?.addEventListener("submit", async ev => { ev.preventDefault(); try { await api(`/api/admin/students/${encodeURIComponent(id)}/enrollments/transfer`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget))) }); showToast("Transfer recorded."); await openAdminStudentProfile(id); await loadStudents($("#student-search")?.value || "", studentPage); } catch (error) { setMessage("#profile-operation-status", error.message, "error"); } });
    content.querySelectorAll("[data-save-enrollment]").forEach(button => button.addEventListener("click", async () => { const enrollmentId = button.dataset.saveEnrollment; const status = content.querySelector(`[data-enrollment-status="${CSS.escape(enrollmentId)}"]`).value; try { await api(`/api/admin/students/${encodeURIComponent(id)}/enrollments/${encodeURIComponent(enrollmentId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); showToast("Enrollment status updated."); await openAdminStudentProfile(id); await loadStudents($("#student-search")?.value || "", studentPage); } catch (error) { showToast(error.message, "error"); } }));
  } catch (error) { content.innerHTML = `<div class="error-state">${escapeHTML(error.message)} <button class="button secondary" data-profile-retry="${escapeHTML(id)}">Retry</button></div>`; content.querySelector("[data-profile-retry]")?.addEventListener("click", () => openAdminStudentProfile(id)); }
}

async function loadAcademics() {

  try {

    const sessions =
      await api(
        "/api/admin/sessions"
      );


    const sessionsList =
      $("#sessions-list");


    if (sessionsList) {

      sessionsList.innerHTML =
        sessions.length

          ? sessions.map(item => `

              <div class="data-row">

                <div>

                  <strong>
                    ${escapeHTML(
                      item.name
                    )}
                  </strong>

                  <small>

                    ${
                      item.startDate
                        ? formatDate(
                            item.startDate
                          )
                        : "Start date not set"
                    }

                    —

                    ${
                      item.endDate
                        ? formatDate(
                            item.endDate
                          )
                        : "End date not set"
                    }

                  </small>

                </div>


                <span
                  class="status-badge ${
                    item.isCurrent
                      ? "active"
                      : ""
                  }"
                >

                  ${
                    item.isCurrent
                      ? "Current"
                      : "Past"
                  }

                </span>
                ${alumniCan("ACADEMICS_MANAGE") ? `<div class="session-row-actions"><button type="button" class="table-action" data-session-edit="${escapeHTML(item.id)}">Edit</button><button type="button" class="table-action" data-session-current="${escapeHTML(item.id)}" ${item.isCurrent ? "disabled" : ""}>Set current</button><button type="button" class="table-action danger" data-session-delete="${escapeHTML(item.id)}">Delete</button></div>` : ""}

              </div>

            `).join("")

          : `

              <div class="empty-state">
                No sessions found.
              </div>

            `;

    }


    setHTML(
      "#overview-sessions",
      sessions.length

        ? sessions
            .slice(0, 5)
            .map(item => `

              <div class="compact-row">

                <span>
                  ${escapeHTML(
                    item.name
                  )}
                </span>

                <strong>
                  ${
                    item.isCurrent
                      ? "Current"
                      : ""
                  }
                </strong>

              </div>

            `)
            .join("")

        : `

            <div class="empty-state">
              No sessions found.
            </div>

          `
    );


    window.adminSessions =
      sessions;
    $$(`[data-session-edit]`).forEach(button => button.addEventListener("click", () => editSession(button.dataset.sessionEdit)));
    $$(`[data-session-current]`).forEach(button => button.addEventListener("click", () => setCurrentSession(button.dataset.sessionCurrent)));
    $$(`[data-session-delete]`).forEach(button => button.addEventListener("click", () => deleteSession(button.dataset.sessionDelete)));


  } catch (error) {

    console.error(
      "LOAD ACADEMICS ERROR:",
      error
    );
    showRetryState("#sessions-list", error.message || "Unable to load sessions.", "academics");
    throw error;

  }

}


// ============================================================
// CLASSES
// ============================================================

async function loadClasses() {

  const container =
    $("#classes-grid");


  if (!container) return;


  try {

    const classes =
      await api(`/api/admin/classes${$("#class-session-filter")?.value ? `?sessionId=${encodeURIComponent($("#class-session-filter").value)}` : ""}`);


    window.adminClasses =
      classes;


    renderClasses(classes);


  } catch (error) {

    container.innerHTML = `

      <div class="empty">

        ${escapeHTML(error.message || "Unable to load classes.")} <button type="button" class="button secondary" data-retry="classes">Retry</button>

      </div>

    `;


    console.error(
      "LOAD CLASSES ERROR:",
      error
    );
    throw error;

  }
}


function renderClasses(classes) {

  const container =
    $("#classes-grid");


  if (!container) return;


  if (!classes.length) {

    container.innerHTML = `

      <div class="empty">

        No classes have been created yet.

      </div>

    `;

    return;
  }


  container.innerHTML =
    classes.map(cls => `

      <article class="class-card">


        <div class="class-card-photo">

          ${
            cls.classPhotoUrl

              ? `

                <img
                  src="${escapeHTML(
                    cls.classPhotoUrl
                  )}"
                  alt="${escapeHTML(
                    cls.name
                  )} class photo"
                  loading="lazy"
                >

              `

              : `

                <div
                  class="class-photo-placeholder"
                >

                  <span>📷</span>

                  <small>
                    No class photo
                  </small>

                </div>

              `
          }

        </div>


        <div class="class-card-body">


          <span class="eyebrow">

            ${escapeHTML(
              cls.level ||
              "CLASS"
            )}

          </span>


          <h3>

            ${escapeHTML(
              cls.name
            )}

          </h3>


          <p>

            ${
              cls.classTeacher

                ? `

                  Class Teacher:
                  ${escapeHTML(
                    cls.classTeacher
                  )}

                `

                : "Class teacher not assigned"
            }

          </p>


          ${
            cls.description

              ? `

                <p class="class-card-description">

                  ${escapeHTML(
                    cls.description
                  )}

                </p>

              `

              : ""
          }


          <div
            class="class-card-footer"
          >


            <strong>

              ${
                cls._count?.enrollments ||
                0
              }

              ${
                cls._count?.enrollments === 1
                  ? "Student"
                  : "Students"
              }

            </strong>


            <button
              type="button"
              class="button secondary"
              data-view-class="${escapeHTML(
                cls.id
              )}"
            >

              View Class →

            </button>


          </div>


        </div>


      </article>

    `).join("");


  $$("[data-view-class]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          openClassDetail(
            button.dataset.viewClass
          );

        }
      );

    });

}


// ============================================================
// CLASS SEARCH
// ============================================================

$("#class-search")
  ?.addEventListener(
    "input",
    event => {

      const query =
        event.target.value
          .trim()
          .toLowerCase();


      const classes =
        window.adminClasses || [];


      const filtered =
        classes.filter(cls => {

          return [

            cls.name,

            cls.level,

            cls.classTeacher,

            cls.description

          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);

        });


      renderClasses(filtered);

    }
  );


// ============================================================
// OPEN CLASS DETAIL
// ============================================================

async function openClassDetail(classId) {

  const panel =
    $("#class-detail-panel");


  const content =
    $("#class-detail-content");


  if (!panel || !content) return;


  panel.hidden = false;


  content.innerHTML = `

    <div class="empty">

      Loading class...

    </div>

  `;


  try {

    const cls =
      await api(
        `/api/admin/classes/${encodeURIComponent(
          classId
        )}`
      );


    window.selectedAdminClass =
      cls;


    renderClassDetail(cls);


    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });


  } catch (error) {

    content.innerHTML = `

      <div class="empty">

        ${escapeHTML(
          error.message ||
          "Unable to load this class."
        )}

      </div>

    `;


    console.error(
      "CLASS DETAIL ERROR:",
      error
    );

  }

}


window.openClassDetail =
  openClassDetail;


// ============================================================
// CLOSE CLASS DETAIL
// ============================================================

$("#close-class-detail")
  ?.addEventListener(
    "click",
    () => {

      const panel =
        $("#class-detail-panel");


      if (!panel) return;


      panel.hidden = true;


      window.selectedAdminClass =
        null;


      $("#section-academics")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

    }
  );


// ============================================================
// RENDER CLASS DETAIL
// ============================================================

function renderClassDetail(cls) {

  const content =
    $("#class-detail-content");


  if (!content) return;


  const students =
    (cls.enrollments || [])
      .map(
        enrollment =>
          enrollment.student
      )
      .filter(Boolean);


  content.innerHTML = `

    <div class="class-almanac">


      <!-- ================================================
           CLASS COVER
      ================================================= -->

      <header class="class-cover">


        <div class="class-cover-image">

          ${
            cls.classPhotoUrl

              ? `

                <img
                  src="${escapeHTML(
                    cls.classPhotoUrl
                  )}"
                  alt="${escapeHTML(
                    cls.name
                  )} class photograph"
                >

              `

              : `

                <div
                  class="class-cover-placeholder"
                >

                  <span>📷</span>

                  <h3>
                    No Class Photograph
                  </h3>

                  <p>
                    Add the class group photograph
                    to create the class almanac cover.
                  </p>

                </div>

              `
          }

        </div>


        <div class="class-cover-info">


          <span class="eyebrow">

            ${escapeHTML(
              cls.level ||
              "ACADEMIC CLASS"
            )}

          </span>


          <h1>

            ${escapeHTML(
              cls.name
            )}

          </h1>


          ${
            cls.classTeacher

              ? `

                <p class="class-teacher">

                  Class Teacher:

                  <strong>

                    ${escapeHTML(
                      cls.classTeacher
                    )}

                  </strong>

                </p>

              `

              : ""
          }


          ${
            cls.description

              ? `

                <p class="class-description">

                  ${escapeHTML(
                    cls.description
                  )}

                </p>

              `

              : ""
          }


          <div class="class-stat">

            <strong>
              ${students.length}
            </strong>

            <span>
              Students
            </span>

          </div>


          <div class="class-photo-actions">


            <label class="button">

              📷

              ${
                cls.classPhotoUrl
                  ? " Change Class Photo"
                  : " Add Class Photo"
              }


              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                hidden
                data-class-photo-input
              >

            </label>


          </div>


          <p
            id="class-photo-status"
            class="form-status"
          ></p>


        </div>

      </header>



      <!-- ================================================
           STUDENTS
      ================================================= -->

      <section class="class-students">


        <div class="section-heading">


          <div>

            <span class="eyebrow">
              THE CLASS
            </span>

            <h2>
              Our Students
            </h2>

          </div>


          <span class="student-count">

            ${students.length}

            ${
              students.length === 1
                ? "student"
                : "students"
            }

          </span>


        </div>


        ${
          students.length

            ? `

              <div
                class="student-almanac-grid"
              >

                ${students
                  .map(
                    renderClassStudentCard
                  )
                  .join("")}

              </div>

            `

            : `

              <div class="empty">

                No students are enrolled
                in this class yet.

              </div>

            `
        }


      </section>


    </div>

  `;


  const photoInput =
    content.querySelector(
      "[data-class-photo-input]"
    );


  photoInput?.addEventListener(
    "change",
    event => {

      uploadClassPhoto(
        cls.id,
        event.target.files?.[0]
      );

    }
  );


  $$("[data-view-student]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          viewStudentFromClass(
            button.dataset.viewStudent
          );

        }
      );

    });

}


// ============================================================
// CLASS STUDENT CARD
// ============================================================

function renderClassStudentCard(student) {

  const fullName =
    studentFullName(student);


  return `

    <article
      class="student-almanac-card"
    >


      <div class="student-photo">


        ${
          student.photoUrl

            ? `

              <img
                src="${escapeHTML(
                  student.photoUrl
                )}"
                alt="${escapeHTML(
                  fullName
                )}"
                loading="lazy"
              >

            `

            : `

              <div
                class="student-photo-placeholder"
              >

                <span>
                  👤
                </span>

              </div>

            `
        }


      </div>


      <div class="student-card-body">


        <span class="student-id">

          ${escapeHTML(
            student.studentId
          )}

        </span>


        <h3>

          ${escapeHTML(
            fullName
          )}

        </h3>


        <button
          type="button"
          class="button secondary"
          data-view-student="${escapeHTML(
            student.id
          )}"
        >

          View Profile →

        </button>


      </div>


    </article>

  `;
}


// ============================================================
// STUDENT PROFILE
// ============================================================

function viewStudentFromClass(
  studentId
) {

  const cls =
    window.selectedAdminClass;


  if (!cls?.enrollments) {

    showToast(
      "Student information is unavailable.",
      "error"
    );

    return;
  }


  const enrollment =
    cls.enrollments.find(
      item =>
        item.student?.id ===
        studentId
    );


  const student =
    enrollment?.student;


  if (!student) {

    showToast(
      "Student could not be found.",
      "error"
    );

    return;
  }


  const modal =
    $("#student-profile-modal");


  const content =
    $("#student-profile-content");


  if (!modal || !content) {

    showToast(
      "Student profile window is unavailable.",
      "error"
    );

    return;
  }


  const fullName =
    studentFullName(student);


  content.innerHTML = `

    <div
      class="student-profile-card"
    >


      <div
        class="student-profile-photo"
      >

        ${
          student.photoUrl

            ? `

              <img
                src="${escapeHTML(
                  student.photoUrl
                )}"
                alt="${escapeHTML(
                  fullName
                )}"
              >

            `

            : `

              <div
                class="student-profile-placeholder"
              >
                👤
              </div>

            `
        }

      </div>


      <div
        class="student-profile-info"
      >


        <span class="eyebrow">
          STUDENT PROFILE
        </span>


        <h2>
          ${escapeHTML(fullName)}
        </h2>


        <div
          class="student-profile-grid"
        >


          <div>

            <span>
              Student ID
            </span>

            <strong>
              ${escapeHTML(
                student.studentId
              )}
            </strong>

          </div>


          <div>

            <span>
              Class
            </span>

            <strong>
              ${escapeHTML(
                cls.name
              )}
            </strong>

          </div>


          <div>

            <span>
              Status
            </span>

            <strong>
              ${escapeHTML(
                student.status ||
                "—"
              )}
            </strong>

          </div>


          <div>

            <span>
              Gender
            </span>

            <strong>
              ${escapeHTML(
                student.gender ||
                "—"
              )}
            </strong>

          </div>


          <div>

            <span>
              Date of Birth
            </span>

            <strong>
              ${formatDate(
                student.dateOfBirth
              )}
            </strong>

          </div>


          <div>

            <span>
              Phone
            </span>

            <strong>
              ${escapeHTML(
                student.phone ||
                "—"
              )}
            </strong>

          </div>


          <div>

            <span>
              Email
            </span>

            <strong>
              ${escapeHTML(
                student.email ||
                "—"
              )}
            </strong>

          </div>


          <div>

            <span>
              Session
            </span>

            <strong>
              ${escapeHTML(
                enrollment.session?.name ||
                "—"
              )}
            </strong>

          </div>


          <div>

            <span>
              Address
            </span>

            <strong>
              ${escapeHTML(
                student.address ||
                "—"
              )}
            </strong>

          </div>


        </div>


      </div>


    </div>

  `;


  modal.hidden = false;

}


window.viewStudentFromClass =
  viewStudentFromClass;


// ============================================================
// CLOSE STUDENT PROFILE
// ============================================================

function closeStudentProfile() {

  const modal =
    $("#student-profile-modal");


  if (!modal) return;


  modal.hidden = true;

}


$("#student-profile-close")
  ?.addEventListener(
    "click",
    closeStudentProfile
  );


$("#student-profile-modal")
  ?.querySelector(
    ".student-profile-modal-backdrop"
  )
  ?.addEventListener(
    "click",
    closeStudentProfile
  );


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      closeStudentProfile();

      closeStudentEditor();

    }

  }
);


// ============================================================
// UPLOAD CLASS PHOTO
// ============================================================

async function uploadClassPhoto(
  classId,
  file
) {

  if (!file) return;


  const status =
    $("#class-photo-status");


  try {

    if (
      file.size >
      4 * 1024 * 1024
    ) {

      throw new Error(
        "Image must be 4 MiB or smaller."
      );

    }


    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp"
      ].includes(file.type)
    ) {

      throw new Error(
        "Please select a JPG, PNG or WebP image."
      );

    }


    if (status) {

      status.textContent =
        "Uploading class photograph…";

    }


    const formData =
      new FormData();


    formData.append(
      "photo",
      file
    );


    const response =
      await fetch(
        `/api/admin/classes/${encodeURIComponent(
          classId
        )}/photo`,
        {
          method: "POST",
          credentials: "include",
          body: formData
        }
      );


    let result = {};


    try {

      result =
        await response.json();

    } catch {

      result = {};

    }


    if (
      response.status === 401
    ) {

      window.location.href =
        "admin/login.html";

      return;
    }

    if (response.status === 403) {
      showLockedDoor();
      throw new Error("You do not have access to this area.");
    }


    if (!response.ok) {

      throw new Error(
        result.error ||
        "Upload failed"
      );

    }


    if (status) {

      status.textContent =
        "✓ Class photograph saved.";

    }


    window.selectedAdminClass =
      result;


    renderClassDetail(result);


    await loadClasses();


    showToast(
      "Class photograph saved."
    );


  } catch (error) {

    if (status) {

      status.textContent =
        error.message;

    }


    showToast(
      error.message,
      "error"
    );


    console.error(
      "UPLOAD CLASS PHOTO ERROR:",
      error
    );

  }

}


window.uploadClassPhoto =
  uploadClassPhoto;


// ============================================================
// REFRESH SELECTED CLASS
// ============================================================

async function refreshSelectedClass() {

  const cls =
    window.selectedAdminClass;


  if (!cls?.id) return;


  try {

    const updated =
      await api(
        `/api/admin/classes/${encodeURIComponent(
          cls.id
        )}`
      );


    window.selectedAdminClass =
      updated;


    renderClassDetail(
      updated
    );

  } catch (error) {

    console.error(
      "REFRESH SELECTED CLASS ERROR:",
      error
    );

  }

}


// ============================================================
// ADD STUDENT FROM CLASS
// ============================================================

$("#add-class-student-btn")
  ?.addEventListener(
    "click",
    () => {

      openStudentForm();


      const cls =
        window.selectedAdminClass;


      if (!cls) return;


      const classSelect =
        $("#new-student-class");


      if (classSelect) {

        classSelect.value =
          cls.id;

      }


      const currentSession =
        cls.enrollments
          ?.find(
            item =>
              item.session?.isCurrent
          )
          ?.session;


      if (currentSession) {

        const sessionSelect =
          $("#new-student-session");


        if (sessionSelect) {

          sessionSelect.value =
            currentSession.id;

        }

      }

    }
  );


// ============================================================
// ALUMNI
// ============================================================

function alumniCan(permission) {
  return currentUser?.role === "ADMIN" || currentUser?.permissions?.includes(permission);
}

let adminAlumni = [];
let adminClassSets = [];
let adminAlumniYears = [];
const alumniModal = $("#alumni-modal");

function renderAlumni() {
  const list = $("#alumni-list");
  if (!list) return;
  if (!adminAlumni.length) { list.innerHTML = '<p class="empty-state">No alumni records match these filters.</p>'; return; }
  list.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Alumni ID</th><th>School years</th><th>Class sets</th><th>Status</th><th>Visibility</th><th></th></tr></thead><tbody>${adminAlumni.map(a => `<tr><td><strong>${escapeHTML(a.fullName)}</strong><small>${escapeHTML(a.user?.email || "No portal account")}</small></td><td>${escapeHTML(a.alumniId)}</td><td>${escapeHTML(a.entryYear || "?")} – ${escapeHTML(a.exitYear || a.graduationYear || "?")}</td><td>${(a.classMemberships || []).map(m => escapeHTML(m.classSet.displayName)).join(", ") || "—"}</td><td><span class="status-badge ${escapeHTML(String(a.verificationStatus).toLowerCase())}">${escapeHTML(a.verificationStatus.replaceAll("_", " "))}</span></td><td>${a.isPublic ? "Public" : "Private"}</td><td><button class="button secondary alumni-open" data-id="${escapeHTML(a.id)}" type="button">Details</button></td></tr>`).join("")}</tbody></table></div>`;
}

async function loadAlumni() {
  const list = $("#alumni-list");
  if (list) list.innerHTML = '<div class="list-loading">Loading alumni records...</div>';
  const params = new URLSearchParams();
  const q = $("#alumni-search")?.value.trim();
  const status = $("#alumni-status-filter")?.value;
  const year = $("#alumni-year-filter")?.value;
  const classSetId = $("#alumni-class-filter")?.value;
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (year) params.set("year", year);
  if (classSetId) params.set("classSetId", classSetId);
  try { adminAlumni = await api(`/api/admin/alumni?${params}`); renderAlumni(); }
  catch (e) { if (list) list.innerHTML = `<p class="empty-state error">${escapeHTML(e.message || "Unable to load alumni records.")}</p>`; }
}

function fillAlumniFilters() {
  const yearFilter = $("#alumni-year-filter"), classFilter = $("#alumni-class-filter");
  if (yearFilter) {
    const selected = yearFilter.value;
    const years = adminAlumniYears;
    yearFilter.innerHTML = '<option value="">All years</option>' + years.map(y => '<option value="' + y + '">' + y + '</option>').join("");
    yearFilter.value = years.includes(Number(selected)) ? selected : "";
  }
  if (classFilter) {
    const selected = classFilter.value;
    classFilter.innerHTML = '<option value="">All class sets</option>' + adminClassSets.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.displayName)}</option>`).join("");
    classFilter.value = adminClassSets.some(s => s.id === selected) ? selected : "";
  }
}

async function loadAlumniYears() {
  try {
    const [sets, all] = await Promise.all([api("/api/admin/alumni/class-sets"), api("/api/admin/alumni")]);
    adminClassSets = sets;
    adminAlumniYears = [...new Set(all.map(a => a.exitYear || a.graduationYear).filter(Boolean))].sort((a,b) => b-a);
    fillAlumniFilters(); renderClassSets();
  }
  catch (e) { const box = $("#alumni-class-sets"); if (box) box.innerHTML = `<p class="empty-state error">${escapeHTML(e.message)}</p>`; }
}

function renderClassSets() {
  const box = $("#alumni-class-sets"); if (!box) return;
  if (!adminClassSets.length) { box.innerHTML = '<p class="empty-state">No class sets created yet.</p>'; return; }
  const canManage = alumniCan("ALUMNI_MANAGE");
  box.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Class set</th><th>Years</th><th>Members</th><th>Public</th><th></th></tr></thead><tbody>${adminClassSets.map(s => `<tr><td>${escapeHTML(s.displayName)}</td><td>${escapeHTML(s.entryYear || "?")} – ${escapeHTML(s.exitYear || "?")}</td><td>${s._count?.members || 0}</td><td>${s.isPublic ? "Yes" : "No"}</td><td>${canManage ? `<button class="button secondary edit-class-set" data-id="${escapeHTML(s.id)}" type="button">Edit</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

function alumniDetailMarkup(a, creating = false) {
  const manage = alumniCan("ALUMNI_MANAGE"), verify = alumniCan("ALUMNI_VERIFY");
  return `<form class="admin-form alumni-edit-form" data-id="${escapeHTML(a?.id || "")}">
    <div class="form-grid"><label><span>Full name</span><input name="fullName" required maxlength="160" value="${escapeHTML(a?.fullName || "")}" ${manage ? "" : "disabled"}></label><label><span>Name while attending</span><input name="nameWhileAttending" value="${escapeHTML(a?.nameWhileAttending || "")}" ${manage ? "" : "disabled"}></label><label><span>Former name</span><input name="formerName" value="${escapeHTML(a?.formerName || "")}" ${manage ? "" : "disabled"}></label><label><span>Contact phone (private)</span><input name="phone" value="${escapeHTML(a?.phone || "")}" ${manage ? "" : "disabled"}></label><label><span>WhatsApp (private)</span><input name="whatsapp" value="${escapeHTML(a?.whatsapp || "")}" ${manage ? "" : "disabled"}></label><label><span>Entry year</span><input name="entryYear" type="number" min="1900" max="${new Date().getFullYear() + 1}" value="${escapeHTML(a?.entryYear || "")}" ${manage ? "" : "disabled"}></label><label><span>Exit year</span><input name="exitYear" type="number" min="1900" max="${new Date().getFullYear() + 1}" value="${escapeHTML(a?.exitYear || "")}" ${manage ? "" : "disabled"}></label><label><span>Class / set label</span><input name="graduationClass" value="${escapeHTML(a?.graduationClass || "")}" ${manage ? "" : "disabled"}></label><label><span>Occupation</span><input name="occupation" value="${escapeHTML(a?.occupation || "")}" ${manage ? "" : "disabled"}></label><label><span>Company</span><input name="company" value="${escapeHTML(a?.company || "")}" ${manage ? "" : "disabled"}></label><label><span>Location</span><input name="location" value="${escapeHTML(a?.location || "")}" ${manage ? "" : "disabled"}></label></div>
    <label><span>Biography</span><textarea name="bio" rows="3" ${manage ? "" : "disabled"}>${escapeHTML(a?.bio || "")}</textarea></label>
    <fieldset class="admin-form-grid"><legend>Public profile controls</legend>${[["isPublic","Publicly listed (turn off to archive from directory)"],["publicName","Show name"],["publicFormerName","Show former name"],["publicSchoolHistory","Show school history"],["publicOccupation","Show occupation"],["publicLocation","Show location"],["publicBiography","Show biography"],["publicMemories","Show memories"]].map(([k,label])=>`<label class="check-row"><input type="checkbox" name="${k}" ${a?.[k] ? "checked" : ""} ${manage ? "" : "disabled"}><span>${label}</span></label>`).join("")}</fieldset>
    ${manage ? `<button class="button" type="submit">${creating ? "Create record" : "Save changes"}</button>` : ""}
  </form>
  ${!creating ? `<section class="alumni-detail-section"><h3>Verification</h3><p>Status: <strong>${escapeHTML(a.verificationStatus)}</strong> · Registered ${formatDateTime(a.createdAt)}</p><div class="alumni-actions">${verify ? `<button type="button" class="button verify-alumni" data-status="VERIFIED" data-id="${escapeHTML(a.id)}">Verify</button><button type="button" class="button secondary verify-alumni" data-status="NEEDS_INFORMATION" data-id="${escapeHTML(a.id)}">Request information</button><button type="button" class="button danger verify-alumni" data-status="REJECTED" data-id="${escapeHTML(a.id)}">Reject</button>` : ""}</div><div class="review-history">${(a.reviews || []).map(r=>`<p><span class="status-badge">${escapeHTML(r.newStatus)}</span> · ${formatDateTime(r.createdAt)} · ${escapeHTML(r.reviewer?.email || "Reviewer")}${r.notes ? `<br>${escapeHTML(r.notes)}` : ""}</p>`).join("") || "No decisions recorded."}</div></section>
  <section class="alumni-detail-section"><h3>Student record link</h3><p>${a.student ? `${escapeHTML(studentFullName(a.student))} · ${escapeHTML(a.student.studentId)} · ${escapeHTML(a.student.status)}` : "No student record linked. Alumni records do not require a student link."}</p>${verify && !a.student ? `<form class="student-link-form" data-id="${escapeHTML(a.id)}"><label><span>Find student by name, email or ID</span><input name="q" minlength="2" required><button class="button secondary" type="submit">Search</button></label><div class="student-search-results"></div></form>` : ""}</section>
  <section class="alumni-detail-section"><h3>Class-set memberships</h3><ul>${(a.classMemberships || []).map(m=>`<li>${escapeHTML(m.classSet.displayName)} <span class="status-badge">${escapeHTML(m.status)}</span> ${verify && m.status !== "VERIFIED" && a.verificationStatus === "VERIFIED" ? `<button type="button" class="text-button verify-membership" data-id="${escapeHTML(a.id)}" data-set="${escapeHTML(m.classSetId)}">Verify membership</button>` : ""} ${manage ? `<button type="button" class="text-button remove-membership" data-id="${escapeHTML(a.id)}" data-set="${escapeHTML(m.classSetId)}">Remove</button>` : ""}</li>`).join("") || "<li>No class sets assigned.</li>"}</ul>${manage ? `<form class="membership-form" data-id="${escapeHTML(a.id)}"><label><span>Assign another set</span><select name="classSetId" required><option value="">Choose class set</option>${adminClassSets.map(s=>`<option value="${escapeHTML(s.id)}">${escapeHTML(s.displayName)}</option>`).join("")}</select></label><button class="button secondary" type="submit">Assign set</button></form>` : ""}</section>` : ""}`;
}

async function openAlumni(id = "") {
  const creating = !id;
  try {
    const a = creating ? null : await api(`/api/admin/alumni/${encodeURIComponent(id)}`);
    $("#alumni-modal-title").textContent = creating ? "Create alumni record" : a.fullName;
    $("#alumni-detail-content").innerHTML = alumniDetailMarkup(a, creating);
    alumniModal.classList.remove("hidden");
  } catch (e) { showToast(e.message || "Unable to open alumni record.", "error"); }
}

async function loadUpdateRequests() {
  const list = $("#requests-list"); if (!list) return;
  list.innerHTML = '<div class="list-loading">Loading update requests...</div>';
  try {
    const requests = await api("/api/admin/update-requests");
    setElementText("#request-count", requests.filter(r => r.status === "PENDING").length);
    if (!requests.length) { list.innerHTML = '<p class="empty-state">No profile update requests.</p>'; return; }
    list.innerHTML = requests.map(r => { const review = r.payload?._review; const payload = r.payload?.requestedChanges || (r.payload && typeof r.payload === "object" ? Object.fromEntries(Object.entries(r.payload).filter(([key]) => key !== "_review")) : r.payload); return `<article class="request-item"><div class="request-main"><div class="request-avatar">${escapeHTML((r.alumni?.fullName || "A").charAt(0))}</div><div><strong>${escapeHTML(r.alumni?.fullName || "Alumni")}</strong><small>${escapeHTML(r.alumni?.user?.email || "Account email unavailable")}</small><small>Submitted ${formatDateTime(r.createdAt)}</small></div></div><span class="status-badge ${String(r.status).toLowerCase()}">${escapeHTML(review?.decision || r.status)}</span><div class="request-payload"><strong>Requested changes</strong><pre>${escapeHTML(JSON.stringify(payload, null, 2))}</pre>${review?.notes ? `<p>Staff note: ${escapeHTML(review.notes)}</p>` : ""}</div>${r.status === "PENDING" && alumniCan("ALUMNI_VERIFY") ? `<div class="alumni-actions"><button class="button review-request" data-id="${escapeHTML(r.id)}" data-decision="APPROVED">Approve</button><button class="button secondary review-request" data-id="${escapeHTML(r.id)}" data-decision="NEEDS_INFORMATION">Request information</button><button class="button danger review-request" data-id="${escapeHTML(r.id)}" data-decision="REJECTED">Reject</button></div>` : ""}</article>`; }).join("");
  } catch (e) { list.innerHTML = `<p class="empty-state error">${escapeHTML(e.message || "Unable to load requests.")}</p>`; }
}


let alumniSearchTimer;
$("#alumni-search")?.addEventListener("input", () => { clearTimeout(alumniSearchTimer); alumniSearchTimer = setTimeout(loadAlumni, 250); });
$("#alumni-status-filter")?.addEventListener("change", loadAlumni);
$("#alumni-year-filter")?.addEventListener("change", loadAlumni);
$("#alumni-class-filter")?.addEventListener("change", loadAlumni);
$("#create-alumni")?.addEventListener("click", () => alumniCan("ALUMNI_MANAGE") && openAlumni());
$("#alumni-list")?.addEventListener("click", event => {
  const button = event.target.closest(".alumni-open"); if (button) openAlumni(button.dataset.id);
});
$("[data-close-alumni]")?.addEventListener("click", () => alumniModal.classList.add("hidden"));
alumniModal?.addEventListener("click", event => { if (event.target === alumniModal) alumniModal.classList.add("hidden"); });
$("#alumni-detail-content")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.target;
  if (form.matches(".alumni-edit-form")) {
    const fd = new FormData(form), body = Object.fromEntries(fd.entries());
    for (const key of ["entryYear", "exitYear"]) body[key] = body[key] ? Number(body[key]) : null;
    for (const key of ["isPublic", "publicName", "publicFormerName", "publicSchoolHistory", "publicPhoto", "publicOccupation", "publicLocation", "publicBiography", "publicMemories"]) body[key] = fd.has(key);
    try { const id = form.dataset.id; const existing = adminAlumni.find(a => a.id === id); if (id && existing && existing.isPublic !== body.isPublic && !confirm(body.isPublic ? "Publish this profile? Only verified profiles with opted-in fields are shown." : "Remove this profile from the public alumni directory?")) return; const saved = await api(id ? `/api/admin/alumni/${encodeURIComponent(id)}` : "/api/admin/alumni", { method: id ? "PUT" : "POST", body: JSON.stringify(body) }); showToast(id ? "Alumni record updated." : "Alumni record created."); alumniModal.classList.add("hidden"); await loadAlumni(); if (saved.id) openAlumni(saved.id); }
    catch (e) { showToast(e.message || "Unable to save alumni record.", "error"); }
  } else if (form.matches(".student-link-form")) {
    const q = new FormData(form).get("q"); const box = form.querySelector(".student-search-results"); box.innerHTML = '<p>Searching student records…</p>';
    try { const rows = await api(`/api/admin/students/search?q=${encodeURIComponent(q)}`); box.innerHTML = rows.length ? rows.map(s => `<div class="student-match"><span><strong>${escapeHTML(studentFullName(s))}</strong><small>${escapeHTML(s.studentId)} · ${escapeHTML(s.email || "No email")} · ${escapeHTML(s.status)}</small></span><button type="button" class="button secondary choose-student" data-student="${escapeHTML(s.id)}" data-label="${escapeHTML(`${studentFullName(s)} (${s.studentId})`)}">Link</button></div>`).join("") : '<p class="empty-state">No matching student records.</p>'; }
    catch (e) { box.innerHTML = `<p class="empty-state error">${escapeHTML(e.message)}</p>`; }
  } else if (form.matches(".membership-form")) {
    const classSetId = new FormData(form).get("classSetId");
    try { await api(`/api/admin/alumni/${encodeURIComponent(form.dataset.id)}/class-sets`, { method: "POST", body: JSON.stringify({ classSetId }) }); showToast("Class set assigned."); await openAlumni(form.dataset.id); await loadAlumniYears(); await loadAlumni(); }
    catch (e) { showToast(e.message || "Unable to assign class set.", "error"); }
  }
});
$("#alumni-detail-content")?.addEventListener("click", async event => {
  const verify = event.target.closest(".verify-alumni");
  if (verify) {
    const status = verify.dataset.status;
    if (!confirm(`${status === "VERIFIED" ? "Verify" : status === "REJECTED" ? "Reject" : "Request more information for"} this alumni profile?`)) return;
    const notes = status === "NEEDS_INFORMATION" || status === "REJECTED" ? prompt("Add a note for the review history:") : prompt("Optional verification note:") || "";
    if (status === "NEEDS_INFORMATION" && !notes?.trim()) return;
    try { await api(`/api/admin/alumni/${encodeURIComponent(verify.dataset.id)}/verification`, { method: "POST", body: JSON.stringify({ status, notes }) }); showToast(`Alumni status set to ${status.replaceAll("_", " ")}.`); await loadAlumni(); await openAlumni(verify.dataset.id); }
    catch (e) { showToast(e.message || "Verification failed.", "error"); }
    return;
  }
  const choose = event.target.closest(".choose-student");
  if (choose) {
    if (!confirm(`Confirm that ${choose.dataset.label} is the correct match?`)) return;
    const form = choose.closest(".student-link-form");
    try { await api(`/api/admin/alumni/${encodeURIComponent(form.dataset.id)}/student-link`, { method: "PUT", body: JSON.stringify({ studentId: choose.dataset.student }) }); showToast("Student record linked. Student ID was not changed."); await loadAlumni(); await openAlumni(form.dataset.id); }
    catch (e) { showToast(e.message || "Unable to link student.", "error"); }
    return;
  }
  const remove = event.target.closest(".remove-membership");
  if (remove && confirm("Remove this class-set membership?")) {
    try { await api(`/api/admin/alumni/${encodeURIComponent(remove.dataset.id)}/class-sets/${encodeURIComponent(remove.dataset.set)}`, { method: "DELETE" }); showToast("Membership removed."); await loadAlumniYears(); await loadAlumni(); await openAlumni(remove.dataset.id); }
    catch (e) { showToast(e.message || "Unable to remove membership.", "error"); }
  }
  const membership = event.target.closest(".verify-membership");
  if (membership && confirm("Verify this class-set membership?")) {
    try { await api(`/api/admin/alumni/${encodeURIComponent(membership.dataset.id)}/class-sets/${encodeURIComponent(membership.dataset.set)}`, { method: "PATCH", body: JSON.stringify({ status: "VERIFIED" }) }); showToast("Class-set membership verified."); await loadAlumni(); await openAlumni(membership.dataset.id); }
    catch (e) { showToast(e.message || "Unable to verify membership.", "error"); }
  }
});

function openClassSet(id = "") {
  const set = adminClassSets.find(s => s.id === id);
  const form = $("#class-set-form"); form.reset(); form.elements.id.value = set?.id || "";
  for (const key of ["displayName", "entryYear", "exitYear", "approximatePeriod", "notes"]) form.elements[key].value = set?.[key] ?? "";
  form.elements.isPublic.checked = Boolean(set?.isPublic);
  for (const key of ["entryYear", "exitYear"]) form.elements[key].max = String(new Date().getFullYear() + 1);
  $("#class-set-modal-title").textContent = set ? "Edit class set" : "Add class set";
  $("#class-set-modal").classList.remove("hidden");
}
$("#create-class-set")?.addEventListener("click", () => alumniCan("ALUMNI_MANAGE") && openClassSet());
$("#alumni-class-sets")?.addEventListener("click", event => { const b=event.target.closest(".edit-class-set"); if (b) openClassSet(b.dataset.id); });
$$("[data-close-class-set]").forEach(b => b.addEventListener("click", () => $("#class-set-modal").classList.add("hidden")));
$("#class-set-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const f=event.currentTarget, fd=new FormData(f), id=fd.get("id");
  const body={ displayName:fd.get("displayName"), entryYear:fd.get("entryYear")||null, exitYear:fd.get("exitYear")||null, approximatePeriod:fd.get("approximatePeriod"), notes:fd.get("notes"), isPublic:fd.has("isPublic") };
  const existing = adminClassSets.find(item => item.id === id);
  if (existing && existing.isPublic !== body.isPublic && !confirm(body.isPublic ? "Publish this class set and its verified member list?" : "Hide this class set from the public site?")) return;
  try { await api(id ? `/api/admin/alumni/class-sets/${encodeURIComponent(id)}` : "/api/admin/alumni/class-sets", { method:id?"PUT":"POST", body:JSON.stringify(body) }); $("#class-set-modal").classList.add("hidden"); showToast(id?"Class set updated.":"Class set created."); await loadAlumniYears(); await loadAlumni(); }
  catch(e) { setMessage("#class-set-form-status", e.message || "Unable to save class set.", "error"); }
});
$("#requests-list")?.addEventListener("click", async event => {
  const button=event.target.closest(".review-request"); if (!button) return;
  const decision=button.dataset.decision;
  if (!confirm(`Confirm ${decision.replaceAll("_", " ").toLowerCase()} for this request?`)) return;
  const notes = decision === "NEEDS_INFORMATION" || decision === "REJECTED" ? prompt("Add a note:") : prompt("Optional review note:") || "";
  if (decision === "NEEDS_INFORMATION" && !notes?.trim()) return;
  try { await api(`/api/admin/update-requests/${encodeURIComponent(button.dataset.id)}/review`, { method:"POST", body:JSON.stringify({ decision, notes }) }); showToast("Update request reviewed."); await loadUpdateRequests(); }
  catch(e) { showToast(e.message || "Unable to review request.", "error"); }
});


// ============================================================
// MESSAGES
// ============================================================

async function loadMessages() {

  try {

    const messages =
      await api(
        "/api/admin/messages"
      );


    const list =
      $("#messages-list");


    if (!list) return;


    if (!messages.length) {

      list.innerHTML = `

        <div class="empty-state">

          No messages have been received.

        </div>

      `;

    } else {

      list.innerHTML =
        messages.map(message => `

          <article
            class="message-item"
          >


            <div
              class="message-top"
            >

              <div>

                <strong>

                  ${escapeHTML(
                    message.name
                  )}

                </strong>

                <span>

                  ${escapeHTML(
                    message.email
                  )}

                </span>

              </div>


              <time>

                ${formatDateTime(
                  message.createdAt
                )}

              </time>

            </div>


            ${
              message.subject

                ? `

                  <h4>

                    ${escapeHTML(
                      message.subject
                    )}

                  </h4>

                `

                : ""
            }


            <p>

              ${escapeHTML(
                message.message
              )}

            </p>


            ${
              message.phone

                ? `

                  <small>

                    Phone:
                    ${escapeHTML(
                      message.phone
                    )}

                  </small>

                `

                : ""
            }


            <div
              class="message-state"
            >

              <span
                class="status-badge ${
                  message.isRead
                    ? "read"
                    : "unread"
                }"
              >

                ${
                  message.isRead
                    ? "Read"
                    : "Unread"
                }

              </span>

            </div>


          </article>

        `).join("");

    }


    setElementText(
      "#message-count",
      messages.filter(
        message =>
          !message.isRead
      ).length
    );


  } catch (error) {

    console.error(
      "LOAD MESSAGES ERROR:",
      error
    );

  }
}


// ============================================================
// DEPARTMENTS
// ============================================================

async function loadDepartments() {

  try {

    const departments =
      await api(
        "/api/departments"
      );


    setHTML(
      "#departments-list",

      departments.length

        ? departments.map(
            department => `

              <div class="data-row">

                <div>

                  <strong>

                    ${escapeHTML(
                      department.name
                    )}

                  </strong>

                  <small>

                    ${escapeHTML(
                      department.description ||
                      "No description provided."
                    )}

                  </small>

                </div>


                <span>

                  ${escapeHTML(
                    department.head ||
                    "No head assigned"
                  )}

                </span>

              </div>

            `
          ).join("")

        : `

            <div class="empty-state">

              No departments found.

            </div>

          `
    );


  } catch (error) {

    console.error(
      "LOAD DEPARTMENTS ERROR:",
      error
    );

    setHTML(
      "#departments-list",
      `<div class="empty-state">${escapeHTML(
        error.message || "Unable to load departments."
      )}</div>`
    );

  }
}

// ============================================================
// DATABASE-BACKED CONTENT MANAGEMENT
// ============================================================

const contentPermissions = { news: "CONTENT_VIEW", departments: "CONTENT_VIEW", events: "EVENTS_MANAGE", gallery: "GALLERY_MANAGE" };
const contentManagePermissions = { news: "CONTENT_MANAGE", departments: "CONTENT_MANAGE", events: "EVENTS_MANAGE", gallery: "GALLERY_MANAGE" };
const contentState = { news: [], events: [], departments: [], gallery: [] };
const contentListIds = { news: "news-list", events: "events-list", departments: "departments-list", gallery: "gallery-list" };
const contentForms = { news: "news-form", events: "event-form", departments: "department-form", gallery: "gallery-form" };
const contentEndpoints = { news: "/api/admin/news", events: "/api/admin/events", departments: "/api/admin/departments", gallery: "/api/admin/gallery" };
const contentLabels = { news: "News article", events: "Event", departments: "Department", gallery: "Gallery photo" };
const contentPanelIds = { news: "news-form-panel", events: "event-form-panel", departments: "department-form-panel", gallery: "gallery-form-panel" };
const contentCan = (type, manage = false) => currentUser?.role === "ADMIN" || currentUser?.permissions?.includes((manage ? contentManagePermissions : contentPermissions)[type]) || (!manage && currentUser?.permissions?.includes(contentManagePermissions[type]));

const tickerEndpoint = "/api/admin/breaking-news";
let tickerItems = [];

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function renderTickerAdmin() {
  const list = document.getElementById("ticker-admin-list");
  if (!list) return;
  if (!tickerItems.length) { list.innerHTML = '<div class="empty-state">No ticker headlines yet.</div>'; return; }
  list.innerHTML = tickerItems.map(item => `<article class="content-row"><div><strong>${escapeHTML(item.headline)}</strong><small>${item.isActive ? "Active" : "Inactive"} · Priority ${Number(item.priority) || 0}${item.startsAt ? ` · Starts ${formatDateTime(item.startsAt)}` : ""}${item.expiresAt ? ` · Expires ${formatDateTime(item.expiresAt)}` : ""}</small><small>${escapeHTML(item.destinationUrl || "No destination link")}</small></div><div class="content-row-actions"><button class="button secondary" type="button" data-ticker-edit="${escapeHTML(item.id)}">Edit</button><button class="button secondary" type="button" data-ticker-toggle="${escapeHTML(item.id)}">${item.isActive ? "Deactivate" : "Activate"}</button><button class="button danger" type="button" data-ticker-delete="${escapeHTML(item.id)}">Delete</button></div></article>`).join("");
}

async function loadTickerAdmin() {
  const list = document.getElementById("ticker-admin-list");
  if (!contentCan("news", true)) { if (list) list.hidden = true; return; }
  if (list) { list.hidden = false; list.innerHTML = '<div class="list-loading">Loading ticker headlines...</div>'; }
  try { tickerItems = await api(tickerEndpoint); renderTickerAdmin(); }
  catch (error) { if (list) list.innerHTML = `<p class="empty-state error">${escapeHTML(error.message || "Unable to load ticker headlines.")}</p>`; }
}

function showTickerForm(item = null) {
  const form = document.getElementById("ticker-form");
  if (!form) return;
  form.reset();
  form.elements.id.value = item?.id || "";
  form.elements.headline.value = item?.headline || "";
  form.elements.destinationUrl.value = item?.destinationUrl || "";
  form.elements.priority.value = item?.priority ?? 0;
  form.elements.startsAt.value = localDateTimeValue(item?.startsAt);
  form.elements.expiresAt.value = localDateTimeValue(item?.expiresAt);
  form.elements.isActive.checked = item ? item.isActive === true : true;
  form.classList.remove("hidden");
  form.elements.headline.focus();
}

function initializeTickerManagement() {
  const panel = document.getElementById("ticker-admin-panel");
  const form = document.getElementById("ticker-form");
  if (!panel || !form || panel.dataset.initialized === "true") return;
  panel.dataset.initialized = "true";
  const canManage = contentCan("news", true);
  panel.hidden = !canManage;
  if (!canManage) return;
  document.getElementById("new-ticker-item")?.addEventListener("click", () => showTickerForm());
  document.getElementById("cancel-ticker-item")?.addEventListener("click", () => form.classList.add("hidden"));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = form.elements.id.value;
    const payload = { headline: form.elements.headline.value.trim(), destinationUrl: form.elements.destinationUrl.value.trim(), priority: Number(form.elements.priority.value), isActive: form.elements.isActive.checked, startsAt: form.elements.startsAt.value ? new Date(form.elements.startsAt.value).toISOString() : null, expiresAt: form.elements.expiresAt.value ? new Date(form.elements.expiresAt.value).toISOString() : null };
    try { await api(id ? `${tickerEndpoint}/${encodeURIComponent(id)}` : tickerEndpoint, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }); form.classList.add("hidden"); await loadTickerAdmin(); showToast(`Ticker headline ${id ? "updated" : "created"}.`); }
    catch (error) { setMessage("#ticker-form-status", error.message || "Unable to save ticker headline.", "error"); }
  });
  document.getElementById("ticker-admin-list")?.addEventListener("click", async event => {
    const edit = event.target.closest("[data-ticker-edit]");
    const toggle = event.target.closest("[data-ticker-toggle]");
    const remove = event.target.closest("[data-ticker-delete]");
    const item = tickerItems.find(row => row.id === (edit?.dataset.tickerEdit || toggle?.dataset.tickerToggle || remove?.dataset.tickerDelete));
    if (!item) return;
    if (edit) return showTickerForm(item);
    if (remove && !confirm("Delete this ticker headline?")) return;
    try {
      if (remove) await api(`${tickerEndpoint}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      else await api(`${tickerEndpoint}/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ ...item, isActive: !item.isActive }) });
      await loadTickerAdmin();
    } catch (error) { showToast(error.message || "Unable to update ticker headline.", "error"); }
  });
  loadTickerAdmin();
}

function contentQuery(type) {
  const params = new URLSearchParams();
  const q = $(`#${type}-search`)?.value.trim();
  if (q) params.set("q", q);
  if (type === "news" && $("#news-status-filter")?.value) params.set("status", $("#news-status-filter").value);
  if (type === "events" && $("#events-period-filter")?.value) params.set("period", $("#events-period-filter").value);
  return params.toString();
}

function contentActions(type, row) {
  if (!contentCan(type, true)) return "";
  const publish = type === "news" ? `<button class="button secondary" data-content-publish="${row.isPublished ? "false" : "true"}" data-content-id="${escapeHTML(row.id)}">${row.isPublished ? "Unpublish" : "Publish"}</button>` : "";
  return `<div class="content-row-actions"><button class="button secondary" data-content-edit="${escapeHTML(row.id)}" data-content-type="${type}" type="button">Edit</button>${publish}<button class="button danger" data-content-delete="${escapeHTML(row.id)}" data-content-type="${type}" type="button">Delete</button></div>`;
}

function renderContent(type) {
  const host = document.getElementById(contentListIds[type]);
  if (!host) return;
  const rows = contentState[type];
  if (!rows.length) { host.innerHTML = `<div class="empty-state">No ${type} found.</div>`; return; }
  if (type === "gallery") {
    host.innerHTML = rows.map(row => `<article class="content-gallery-card"><img src="${escapeHTML(row.imageUrl)}" alt="${escapeHTML(row.title || row.caption || "Gallery photo")}" loading="lazy"><div class="content-gallery-copy"><strong>${escapeHTML(row.title || "Untitled photo")}</strong><p>${escapeHTML(row.caption || "No caption")}</p>${contentActions(type, row)}</div></article>`).join("");
    return;
  }
  host.innerHTML = rows.map(row => {
    if (type === "news") return `<article class="content-row"><div><strong>${escapeHTML(row.title)}</strong><small>${row.isPublished ? "Published" : "Draft"} · ${formatDate(row.publishedAt || row.createdAt)}</small><small>${escapeHTML(row.slug)}</small></div>${contentActions(type, row)}</article>`;
    if (type === "events") return `<article class="content-row"><div><strong>${escapeHTML(row.title)}</strong><small>${formatDateTime(row.startsAt)}${row.endsAt ? ` – ${formatDateTime(row.endsAt)}` : ""} · ${escapeHTML(row.location || "No location")}</small><small>${new Date(row.endsAt || row.startsAt) >= new Date() ? "Upcoming" : "Past"}</small></div>${contentActions(type, row)}</article>`;
    return `<article class="content-row"><div><strong>${escapeHTML(row.name)}</strong><small>${escapeHTML(row.description || "No description")}</small><small>${escapeHTML(row.head || "No department head")}</small></div>${contentActions(type, row)}</article>`;
  }).join("");
}

async function loadManagedContent(type) {
  const host = document.getElementById(contentListIds[type]);
  if (!contentCan(type)) { if (host) host.innerHTML = '<p class="empty-state">You do not have access to this section.</p>'; return; }
  if (host) host.innerHTML = '<div class="list-loading">Loading...</div>';
  try {
    const query = contentQuery(type);
    contentState[type] = await api(`${contentEndpoints[type]}${query ? `?${query}` : ""}`);
    renderContent(type);
  } catch (error) { if (host) host.innerHTML = `<p class="empty-state error">${escapeHTML(error.message || `Unable to load ${type}.`)}</p>`; }
}

function showContentForm(type, item = null) {
  const form = document.getElementById(contentForms[type]);
  const panel = document.getElementById(contentPanelIds[type]);
  if (!form || !panel) return;
  form.reset();
  form.dataset.contentId = item?.id || "";
  for (const [key, value] of Object.entries(item || {})) {
    const field = form.elements.namedItem(key);
    if (field && field.type !== "file" && field.type !== "checkbox") field.value = value == null ? "" : key === "startsAt" || key === "endsAt" ? new Date(value).toISOString().slice(0, 16) : String(value);
  }
  if (type === "news" && form.elements.isPublished) form.elements.isPublished.value = item?.isPublished ? "true" : "false";
  if (type === "departments") form.elements.id.value = item?.id || "";
  const preview = form.querySelector(".content-image-preview");
  if (preview) { preview.hidden = !item?.imageUrl; preview.src = item?.imageUrl || ""; }
  panel.classList.remove("hidden");
  form.querySelector("input:not([type=hidden])")?.focus();
}

function contentPayload(form) {
  const data = Object.fromEntries(new FormData(form));
  delete data.image;
  delete data.id;
  if (form.id === "news-form") data.isPublished = data.isPublished === "true";
  return data;
}

async function saveManagedContent(type, form) {
  if (!contentCan(type, true)) throw new Error("You do not have permission to manage this section.");
  const file = form.elements.image?.files?.[0];
  const id = form.dataset.contentId || (type === "departments" ? form.elements.id?.value : "");
  const payload = contentPayload(form);
  if (type === "events") {
    for (const field of ["startsAt", "endsAt"]) {
      if (!payload[field]) { if (field === "endsAt") continue; throw new Error("Enter a valid event start date."); }
      const parsed = new Date(payload[field]);
      if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid event date.");
      payload[field] = parsed.toISOString();
    }
  }
  const body = file ? new FormData(form) : JSON.stringify(payload);
  if (body instanceof FormData) { body.delete("id"); if (type === "news") body.set("isPublished", form.elements.isPublished.value === "true" ? "true" : "false"); }
  if (body instanceof FormData && type === "events") {
    body.set("startsAt", payload.startsAt);
    if (payload.endsAt) body.set("endsAt", payload.endsAt); else body.delete("endsAt");
  }
  const endpoint = contentEndpoints[type] + (id ? `/${encodeURIComponent(id)}` : "");
  setMessage(`#${form.id}-status`, id ? "Saving changes..." : "Creating... ");
  await api(endpoint, { method: id ? "PUT" : "POST", body });
  form.reset(); form.dataset.contentId = "";
  const panel = form.closest(".panel"); panel?.classList.add("hidden");
  await loadManagedContent(type);
  showToast(`${contentLabels[type]} ${id ? "updated" : "created"}.`);
}

async function editManagedContent(type, id) {
  if (!contentCan(type, true)) return showToast("You do not have permission to edit this content.", "error");
  try { showContentForm(type, await api(`${contentEndpoints[type]}/${encodeURIComponent(id)}`)); }
  catch (error) { showToast(error.message || "Unable to load content for editing.", "error"); }
}

function initializeContentManagement() {
  initializeTickerManagement();
  for (const type of Object.keys(contentEndpoints)) {
    const section = document.getElementById(`section-${type}`);
    const nav = document.querySelector(`[data-section="${type}"]`);
    const permitted = contentCan(type);
    if (section) section.hidden = !permitted;
    if (nav) nav.hidden = !permitted;
    const canManage = contentCan(type, true);
    const newButton = document.getElementById({ news: "new-news-button", events: "new-event-button", departments: "new-department-button", gallery: "new-gallery-button" }[type]);
    if (newButton) newButton.hidden = !canManage;
    const form = document.getElementById(contentForms[type]);
    if (form) form.addEventListener("submit", async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      try { await saveManagedContent(type, form); setMessage(`#${form.id}-status`, `${contentLabels[type]} saved successfully.`, "success"); }
      catch (error) { setMessage(`#${form.id}-status`, error.message || `Unable to save ${type}.`, "error"); showToast(error.message || `Unable to save ${type}.`, "error"); }
    }, true);
    const list = document.getElementById(contentListIds[type]);
    list?.addEventListener("click", async event => {
      const edit = event.target.closest("[data-content-edit]");
      const publish = event.target.closest("[data-content-publish]");
      const remove = event.target.closest("[data-content-delete]");
      if (edit) return editManagedContent(type, edit.dataset.contentEdit);
      if (publish) {
        if (!confirm(`${publish.dataset.contentPublish === "true" ? "Publish" : "Unpublish"} this article?`)) return;
        try { const item = await api(`${contentEndpoints.news}/${encodeURIComponent(publish.dataset.contentId)}`); const fd = new FormData(); for (const [key, value] of Object.entries(item)) if (!["id", "createdAt", "updatedAt", "publishedAt"].includes(key) && value != null) fd.set(key, String(value)); fd.set("isPublished", publish.dataset.contentPublish); await api(`${contentEndpoints.news}/${encodeURIComponent(item.id)}`, { method: "PUT", body: fd }); await loadManagedContent("news"); showToast(`Article ${publish.dataset.contentPublish === "true" ? "published" : "unpublished"}.`); }
        catch (error) { showToast(error.message || "Unable to change publication status.", "error"); }
      }
      if (remove) {
        if (!confirm(`Delete this ${contentLabels[type].toLowerCase()}? This cannot be undone.`)) return;
        try { await api(`${contentEndpoints[type]}/${encodeURIComponent(remove.dataset.contentId)}`, { method: "DELETE" }); await loadManagedContent(type); showToast(`${contentLabels[type]} deleted.`); }
        catch (error) { showToast(error.message || "Unable to delete content.", "error"); }
      }
    });
    if (type !== "departments") document.getElementById({ news: "refresh-news", events: "refresh-events", gallery: "refresh-gallery" }[type])?.addEventListener("click", () => loadManagedContent(type));
    const search = document.getElementById(`${type}-search`);
    let timer;
    search?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => loadManagedContent(type), 250); });
  }
  $("#news-status-filter")?.addEventListener("change", () => loadManagedContent("news"));
  $("#events-period-filter")?.addEventListener("change", () => loadManagedContent("events"));
  document.querySelectorAll(".content-image-preview").forEach(preview => {
    preview.closest("form")?.elements.image?.addEventListener("change", event => { const file = event.target.files?.[0]; if (!file) { preview.hidden = true; return; } if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 4 * 1024 * 1024) { event.target.value = ""; preview.hidden = true; setMessage(`#${event.target.form.id}-status`, "Choose a JPG, PNG or WebP image smaller than 4 MB.", "error"); return; } preview.src = URL.createObjectURL(file); preview.hidden = false; });
  });
  $("#new-news-button")?.addEventListener("click", () => showContentForm("news"));
  $("#new-event-button")?.addEventListener("click", () => showContentForm("events"));
  $("#new-gallery-button")?.addEventListener("click", () => showContentForm("gallery"));
  $("#new-department-button")?.addEventListener("click", () => showContentForm("departments"));
  for (const [formId, type] of Object.entries({ "news-form": "news", "event-form": "events", "gallery-form": "gallery", "department-form": "departments" })) {
    const form = document.getElementById(formId);
    for (const button of form?.querySelectorAll("[id^=cancel-], [id^=close-]") || []) button.addEventListener("click", () => { form.closest(".panel")?.classList.add("hidden"); form.reset(); form.dataset.contentId = ""; });
  }
  for (const type of Object.keys(contentEndpoints)) if (contentCan(type)) loadManagedContent(type);
}


$("#new-department-button")
  ?.addEventListener("click", () => {
    $("#department-form-panel")
      ?.classList.remove("hidden");
    $("#department-form [name='name']")?.focus();
  });


["#close-department-form", "#cancel-department"]
  .forEach(selector => {
    $(selector)?.addEventListener("click", () => {
      $("#department-form-panel")
        ?.classList.add("hidden");
    });
  });


$("#department-form")
  ?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      setMessage(
        "#department-form-status",
        "Saving department..."
      );

      await api("/api/admin/departments", {
        method: "POST",
        body: JSON.stringify(data)
      });

      form.reset();
      setMessage(
        "#department-form-status",
        "Department saved and published.",
        "success"
      );
      showToast("Department added to the public directory.");
      await loadDepartments();
    } catch (error) {
      setMessage(
        "#department-form-status",
        error.message,
        "error"
      );
    }
  });


// ============================================================
// NEWS
// ============================================================

$("#news-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const form =
        event.currentTarget;


      const data =
        Object.fromEntries(
          new FormData(form)
        );


      data.isPublished =
        data.isPublished ===
        "true";


      if (!data.slug)
        delete data.slug;


      if (!data.excerpt)
        delete data.excerpt;


      if (!data.imageUrl)
        delete data.imageUrl;


      if (data.isPublished) {

        data.publishedAt =
          new Date().toISOString();

      }


      try {

        setMessage(
          "#news-form-status",
          "Creating news article..."
        );


        await api(
          "/api/admin/news",
          {
            method: "POST",
            body:
              JSON.stringify(data)
          }
        );


        setMessage(
          "#news-form-status",
          "News article created successfully.",
          "success"
        );


        showToast(
          "News article created."
        );


        form.reset();


        await loadOverview();


      } catch (error) {

        setMessage(
          "#news-form-status",
          error.message,
          "error"
        );

      }

    }
  );


// ============================================================
// EVENT FORM
// ============================================================

$("#event-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const form =
        event.currentTarget;


      const data =
        Object.fromEntries(
          new FormData(form)
        );


      const startDate =
        new Date(
          data.startsAt
        );


      if (
        Number.isNaN(
          startDate.getTime()
        )
      ) {

        setMessage(
          "#event-form-status",
          "Please enter a valid start date.",
          "error"
        );

        return;
      }


      data.startsAt =
        startDate.toISOString();


      if (data.endsAt) {

        const endDate =
          new Date(
            data.endsAt
          );


        if (
          Number.isNaN(
            endDate.getTime()
          )
        ) {

          setMessage(
            "#event-form-status",
            "Please enter a valid end date.",
            "error"
          );

          return;
        }


        data.endsAt =
          endDate.toISOString();

      } else {

        delete data.endsAt;

      }


      if (!data.location)
        delete data.location;


      if (!data.description)
        delete data.description;


      if (!data.imageUrl)
        delete data.imageUrl;


      try {

        setMessage(
          "#event-form-status",
          "Creating event..."
        );


        await api(
          "/api/admin/events",
          {
            method: "POST",
            body:
              JSON.stringify(data)
          }
        );


        setMessage(
          "#event-form-status",
          "Event created successfully.",
          "success"
        );


        showToast(
          "Event created."
        );


        form.reset();


        await loadOverview();


      } catch (error) {

        setMessage(
          "#event-form-status",
          error.message,
          "error"
        );

      }

    }
  );


// ============================================================
// GALLERY FORM
// ============================================================

$("#gallery-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const form =
        event.currentTarget;


      const data =
        Object.fromEntries(
          new FormData(form)
        );


      if (!data.title)
        delete data.title;


      if (!data.caption)
        delete data.caption;


      try {

        setMessage(
          "#gallery-form-status",
          "Adding gallery photo..."
        );


        await api(
          "/api/admin/gallery",
          {
            method: "POST",
            body:
              JSON.stringify(data)
          }
        );


        setMessage(
          "#gallery-form-status",
          "Gallery photo added successfully.",
          "success"
        );


        showToast(
          "Gallery photo added."
        );


        form.reset();


        await loadOverview();


      } catch (error) {

        setMessage(
          "#gallery-form-status",
          error.message,
          "error"
        );

      }

    }
  );


// ============================================================
// PUBLIC SETTINGS
// ============================================================

async function loadPublicSettings() {

  try {

    const settings =
      await api(
        "/api/settings/public"
      );


    setHTML(
      "#public-settings",

      Object.entries(settings).length

        ? Object.entries(settings)
            .map(
              ([key, value]) => `

                <div class="data-row">

                  <div>

                    <strong>
                      ${escapeHTML(key)}
                    </strong>

                  </div>

                  <span>

                    ${escapeHTML(value)}

                  </span>

                </div>

              `
            )
            .join("")

        : `

            <div class="empty-state">

              No public settings configured.

            </div>

          `
    );


  } catch (error) {

    console.error(
      "LOAD PUBLIC SETTINGS ERROR:",
      error
    );

  }
}


// ============================================================
// OVERVIEW STUDENTS
// ============================================================

async function loadOverviewStudents() {

  try {

    const students =
      await api(
        "/api/admin/students"
      );


    setHTML(
      "#overview-students",

      (students.items || students).length

        ? (students.items || students)
            .slice(0, 6)
            .map(student => {

              const enrollment = student.enrollments?.find(item => item.session?.isCurrent && item.status === "ENROLLED") || student.enrollments?.[0];


              return `

                <div
                  class="compact-row"
                >

                  <div>

                    <strong>

                      ${escapeHTML(
                        studentFullName(
                          student
                        )
                      )}

                    </strong>

                    <small>

                      ${escapeHTML(
                        student.studentId
                      )}

                    </small>

                  </div>


                  <span>

                    ${escapeHTML(
                      enrollment?.class?.name ||
                      "No class"
                    )}

                  </span>

                </div>

              `;

            })
            .join("")

        : `

            <div class="empty-state">

              No students found.

            </div>

          `
    );


  } catch (error) {

    console.error(
      "LOAD OVERVIEW STUDENTS ERROR:",
      error
    );
    showRetryState("#overview-students", error.message || "Unable to load students.", "overviewStudents");
    throw error;

  }
}


// ============================================================
// REFRESH BUTTONS
// ============================================================

$("#refresh-dashboard")
  ?.addEventListener(
    "click",
    async () => {

      const jobs = [loadOverview()];
      if (alumniCan("STUDENTS_VIEW")) jobs.push(loadOverviewStudents());
      if (alumniCan("ACADEMICS_VIEW")) jobs.push(loadAcademics(), loadClasses());
      try { await Promise.all(jobs); showToast("Dashboard refreshed."); }
      catch (error) { showToast(`Refresh incomplete: ${error.message}`, "error"); }

    }
  );


$("#refresh-students")
  ?.addEventListener(
    "click",
    () => {

      loadStudents(
        $("#student-search")
          ?.value
          ?.trim() || ""
      );

    }
  );


$("#refresh-alumni")
  ?.addEventListener(
    "click",
    async () => {

      await loadAlumni();

      await loadAlumniYears();

      await loadUpdateRequests();

      showToast(
        "Alumni data refreshed."
      );

    }
  );


$("#refresh-requests")
  ?.addEventListener(
    "click",
    () => {

      loadUpdateRequests();

    }
  );


$("#refresh-messages")
  ?.addEventListener(
    "click",
    () => {

      loadMessages();

    }
  );


$("#refresh-departments")
  ?.addEventListener(
    "click",
    () => {

      loadManagedContent("departments");

    }
  );


// ============================================================
// NEWS FORM UI
// ============================================================

$("#new-news-button")
  ?.addEventListener(
    "click",
    () => {

      $("#news-form-panel")
        ?.classList.remove(
          "hidden"
        );

    }
  );


$("#close-news-form")
  ?.addEventListener(
    "click",
    () => {

      $("#news-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


$("#cancel-news")
  ?.addEventListener(
    "click",
    () => {

      $("#news-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


// ============================================================
// EVENT FORM UI
// ============================================================

$("#new-event-button")
  ?.addEventListener(
    "click",
    () => {

      $("#event-form-panel")
        ?.classList.remove(
          "hidden"
        );

    }
  );


$("#close-event-form")
  ?.addEventListener(
    "click",
    () => {

      $("#event-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


$("#cancel-event")
  ?.addEventListener(
    "click",
    () => {

      $("#event-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


// ============================================================
// GALLERY FORM UI
// ============================================================

$("#new-gallery-button")
  ?.addEventListener(
    "click",
    () => {

      $("#gallery-form-panel")
        ?.classList.remove(
          "hidden"
        );

    }
  );


$("#close-gallery-form")
  ?.addEventListener(
    "click",
    () => {

      $("#gallery-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


$("#cancel-gallery")
  ?.addEventListener(
    "click",
    () => {

      $("#gallery-form-panel")
        ?.classList.add(
          "hidden"
        );

    }
  );


// ============================================================
// CLASS MODAL
// ============================================================

function openClassModal(
  classData = null
) {

  const modal =
    $("#class-modal");


  if (!modal) return;


  setElementText(
    "#class-modal-title",
    classData
      ? "Edit Class"
      : "Create Class"
  );


  const classId =
    $("#class-id");


  const className =
    $("#class-name");


  const classLevel =
    $("#class-level");


  const classTeacher =
    $("#class-teacher");


  const classDescription =
    $("#class-description");


  if (classId) {

    classId.value =
      classData?.id || "";

  }


  if (className) {

    className.value =
      classData?.name || "";

  }


  if (classLevel) {

    classLevel.value =
      classData?.level || "";

  }


  if (classTeacher) {

    classTeacher.value =
      classData?.classTeacher || "";

  }


  if (classDescription) {

    classDescription.value =
      classData?.description || "";

  }


  modal.hidden = false;

}


function closeClassModal() {

  const modal =
    $("#class-modal");


  if (!modal) return;


  modal.hidden = true;

}


$("#add-class-btn")
  ?.addEventListener(
    "click",
    () => {
      openClassModal();
    }
  );


$("#edit-class-btn")
  ?.addEventListener(
    "click",
    () => {
      if (window.selectedAdminClass) {
        openClassModal(window.selectedAdminClass);
      }
    }
  );

$$("[data-close-class-modal]")
  .forEach(button => {

    button.addEventListener(
      "click",
      closeClassModal
    );

  });


// ============================================================
// CLASS FORM
// ============================================================

$("#class-form")
  ?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const classId = $("#class-id")?.value.trim();
      const payload = {
        name: $("#class-name")?.value.trim(),
        level: $("#class-level")?.value.trim(),
        classTeacher: $("#class-teacher")?.value.trim(),
        description: $("#class-description")?.value.trim()
      };
      const status = classId ? "Updating class..." : "Creating class...";

      setMessage("#class-form-status", status);

      try {
        await api(
          classId
            ? `/api/admin/classes/${encodeURIComponent(classId)}`
            : "/api/admin/classes",
          {
            method: classId ? "PUT" : "POST",
            body: JSON.stringify(payload)
          }
        );

        setMessage(
          "#class-form-status",
          classId ? "Class updated successfully." : "Class created successfully.",
          "success"
        );
        showToast(classId ? "Class updated." : "Class created.");
        closeClassModal();
        await loadClasses();

        if (classId) {
          await openClassDetail(classId);
        }
      } catch (error) {
        setMessage(
          "#class-form-status",
          error.message || "Unable to save class.",
          "error"
        );
        showToast(error.message || "Unable to save class.", "error");
      }
    }
  );

// ============================================================
// LOGOUT
// ============================================================

$("#logout")
  ?.addEventListener(
    "click",
    async () => {

      const confirmed =
        confirm(
          "Are you sure you want to sign out?"
        );


      if (!confirmed) return;


      try {

        await api(
          "/api/auth/logout",
          {
            method: "POST"
          }
        );

      } catch {

        // Leave admin area even
        // if server logout fails.

      }


      window.location.href =
        "admin/login.html";

    }
  );


// ============================================================
// INITIALIZATION
// ============================================================

async function initializeAdmin() {

  try {

    await loadCurrentUser();

    initializeContentManagement();


    await Promise.all([

      loadOverview(),

      loadStudents(),

      loadStudentFormOptions(),

      loadAcademics(),

      loadClasses(),

      loadAlumni(),

      loadAlumniYears(),

      loadUpdateRequests(),

      loadMessages(),

      loadPublicSettings(),

      loadOverviewStudents()

    ]);


    console.log(
      "ADMIN DASHBOARD INITIALIZED"
    );


  } catch (error) {

    console.error(
      "ADMIN INITIALIZATION ERROR:",
      error
    );


    if (
      error.message !==
      "Authentication required"
    ) {

      showToast(
        error.message,
        "error"
      );

    }

  }

}


initializeAdmin();
