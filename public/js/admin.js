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
      "/admin/login.html";

    throw new Error(
      "Authentication required"
    );
  }


  if (response.status === 403) {

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


// ============================================================
// CURRENT USER
// ============================================================

let currentUser = null;


async function loadCurrentUser() {

  currentUser =
    await api("/api/auth/me");


  if (
    !["ADMIN", "STAFF"]
      .includes(currentUser.role)
  ) {

    window.location.href =
      "/student/";

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

async function loadOverview() {

  try {

    const overview =
      await api("/api/admin/overview");


    const stats = [

      {
        label: "Students",
        value: overview.students,
        icon: "♙"
      },

      {
        label: "Alumni",
        value: overview.alumni,
        icon: "◎"
      },

      {
        label: "News Articles",
        value: overview.news,
        icon: "▣"
      },

      {
        label: "Events",
        value: overview.events,
        icon: "◷"
      },

      {
        label: "Unread Messages",
        value: overview.unreadMessages,
        icon: "✉"
      },

      {
        label: "Pending Requests",
        value:
          overview.pendingUpdateRequests,
        icon: "!"
      }

    ];


    setHTML(
      "#stats",
      stats.map(item => `

        <article class="stat-card">

          <div class="stat-icon">
            ${item.icon}
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

  }
}


// ============================================================
// STUDENTS
// ============================================================

let studentSearchTimer = null;


async function loadStudents(query = "") {

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

    const students =
      await api(
        `/api/admin/students?q=${encodeURIComponent(query)}`
      );


    setElementText(
      "#student-count",
      `${students.length} student${
        students.length === 1
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

        const enrollment =
          student.enrollments?.[0];


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


            if (student) {

              openStudentEditor(
                student
              );

            }

          }
        );

      });


  } catch (error) {

    table.innerHTML = `

      <tr>

        <td
          colspan="6"
          class="table-empty error-text"
        >

          ${escapeHTML(
            error.message
          )}

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

    const [
      classes,
      sessions
    ] = await Promise.all([

      api("/api/admin/classes"),

      api("/api/admin/sessions")

    ]);


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
            "/admin/login.html";

          return;
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


      if (file.size > 5 * 1024 * 1024) {

        preview.innerHTML = `

          <span>⚠️</span>

          <small>
            Image is larger than 5 MB
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

            loadStudents(
              event.target.value
                .trim()
            );

          },
          300
        );

    }
  );


// ============================================================
// ACADEMICS
// ============================================================

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


  } catch (error) {

    console.error(
      "LOAD ACADEMICS ERROR:",
      error
    );

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
      await api(
        "/api/admin/classes"
      );


    window.adminClasses =
      classes;


    renderClasses(classes);


  } catch (error) {

    container.innerHTML = `

      <div class="empty">

        Unable to load classes.

      </div>

    `;


    console.error(
      "LOAD CLASSES ERROR:",
      error
    );

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
      5 * 1024 * 1024
    ) {

      throw new Error(
        "Image must be smaller than 5 MB."
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
        "/admin/login.html";

      return;
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

async function loadAlumni() {

  try {

    const requests =
      await api(
        "/api/admin/update-requests"
      );


    const list =
      $("#alumni-list");


    if (!list) return;


    if (!requests.length) {

      list.innerHTML = `

        <div class="empty-state">

          No alumni update requests.

        </div>

      `;

    } else {

      list.innerHTML =
        requests.map(request => {

          const student =
            request.alumni?.student;


          return `

            <article
              class="request-item"
            >


              <div
                class="request-main"
              >


                <div
                  class="request-avatar"
                >

                  ${escapeHTML(
                    (
                      student?.firstName ||
                      "A"
                    ).charAt(0)
                  )}

                </div>


                <div>

                  <strong>

                    ${escapeHTML(
                      student
                        ? studentFullName(
                            student
                          )
                        : "Alumni"
                    )}

                  </strong>


                  <small>

                    ${escapeHTML(
                      student?.studentId ||
                      "No student ID"
                    )}

                  </small>


                  <small>

                    Submitted
                    ${formatDateTime(
                      request.createdAt
                    )}

                  </small>

                </div>


              </div>


              <div
                class="request-status"
              >

                <span
                  class="status-badge ${String(
                    request.status ||
                    ""
                  ).toLowerCase()}"
                >

                  ${escapeHTML(
                    request.status ||
                    "PENDING"
                  )}

                </span>

              </div>


              <div
                class="request-payload"
              >

                <strong>
                  Requested changes
                </strong>


                <pre>${escapeHTML(
                  JSON.stringify(
                    request.payload ||
                      {},
                    null,
                    2
                  )
                )}</pre>

              </div>


            </article>

          `;

        }).join("");

    }


    setElementText(
      "#request-count",
      requests.filter(
        request =>
          request.status ===
          "PENDING"
      ).length
    );


  } catch (error) {

    console.error(
      "LOAD ALUMNI ERROR:",
      error
    );

  }
}


// ============================================================
// ALUMNI YEARS
// ============================================================

async function loadAlumniYears() {

  try {

    const years =
      await api(
        "/api/alumni/years"
      );


    const select =
      $("#alumni-year-filter");


    if (!select) return;


    const current =
      select.value;


    select.innerHTML = `

      <option value="">
        All graduation years
      </option>

      ${years.map(year => `

        <option
          value="${escapeHTML(year)}"
        >

          ${escapeHTML(year)}

        </option>

      `).join("")}

    `;


    if (
      years
        .map(String)
        .includes(String(current))
    ) {

      select.value =
        current;

    }


  } catch (error) {

    console.error(
      "LOAD ALUMNI YEARS ERROR:",
      error
    );

  }

}


// ============================================================
// ALUMNI SEARCH
// ============================================================

$("#alumni-search")
  ?.addEventListener(
    "input",
    () => {

      // Alumni endpoint currently
      // returns the full dataset.
      // Filtering can be added once
      // the admin alumni endpoint exists.

    }
  );


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

  }
}


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

      students.length

        ? students
            .slice(0, 6)
            .map(student => {

              const enrollment =
                student.enrollments?.[0];


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

  }
}


// ============================================================
// REFRESH BUTTONS
// ============================================================

$("#refresh-dashboard")
  ?.addEventListener(
    "click",
    async () => {

      await Promise.all([

        loadOverview(),

        loadOverviewStudents(),

        loadAcademics(),

        loadClasses()

      ]);


      showToast(
        "Dashboard refreshed."
      );

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

      showToast(
        "Alumni data refreshed."
      );

    }
  );


$("#refresh-requests")
  ?.addEventListener(
    "click",
    () => {

      loadAlumni();

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

      loadDepartments();

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


      /*
       * IMPORTANT:
       *
       * The current backend you supplied only has
       * GET /api/admin/classes.
       *
       * Therefore we do not pretend that POST/PUT
       * class endpoints already exist.
       *
       * Once those endpoints are added to server/index.js,
       * this form can call them.
       */

      setMessage(
        "#class-form-status",
        "Class saving API is not connected yet.",
        "error"
      );


      showToast(
        "Class create/edit API still needs to be added.",
        "error"
      );

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
        "/admin/login.html";

    }
  );


// ============================================================
// INITIALIZATION
// ============================================================

async function initializeAdmin() {

  try {

    await loadCurrentUser();


    await Promise.all([

      loadOverview(),

      loadStudents(),

      loadStudentFormOptions(),

      loadAcademics(),

      loadClasses(),

      loadAlumni(),

      loadAlumniYears(),

      loadMessages(),

      loadDepartments(),

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