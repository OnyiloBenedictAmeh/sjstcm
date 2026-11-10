// ============================================================
// STUDENT / ALUMNI PORTAL
// ============================================================

"use strict";


// ============================================================
// HELPERS
// ============================================================

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

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric"
    }
  );

}


// ============================================================
// LOAD PORTAL
// ============================================================

async function load() {

  try {

    // --------------------------------------------------------
    // AUTHENTICATION
    // --------------------------------------------------------

    const authResponse =
      await fetch(
        "/api/auth/me",
        {
          credentials: "include",
          cache: "no-store"
        }
      );


    if (!authResponse.ok) {

      window.location.href =
        "student/login.html?notice=session-expired";

      return;

    }


    const me =
      await authResponse.json();


    // --------------------------------------------------------
    // ROLE CHECK
    // --------------------------------------------------------

    if (me.role !== "STUDENT") {

      const target = me.role === "ADMIN" || me.role === "STAFF"
        ? "admin/"
        : me.role === "ALUMNI"
          ? "alumni/index.html"
          : "student/login.html";
      window.location.replace(new URL(target, document.baseURI).href);

      return;

    }


    // --------------------------------------------------------
    // LOAD STUDENT PROFILE
    // --------------------------------------------------------

    const profileResponse =
      await fetch(
        "/api/student/profile",
        {
          credentials: "include",
          cache: "no-store"
        }
      );


    if (
      profileResponse.status === 401
    ) {

      window.location.href =
        "student/login.html?notice=session-expired";

      return;

    }


    if (
      !profileResponse.ok
    ) {

      throw new Error(
        "Unable to load student profile."
      );

    }


    const student =
      await profileResponse.json();


    // --------------------------------------------------------
    // CURRENT ENROLLMENT
    // --------------------------------------------------------

    const enrollment = student.currentEnrollment;


    // --------------------------------------------------------
    // WELCOME MESSAGE
    // --------------------------------------------------------

    const nameElement =
      document.querySelector(
        "#name"
      );


    if (nameElement) {
      const signedInName = [me.student?.firstName, me.student?.middleName, me.student?.lastName]
        .filter(value => typeof value === "string" && value.trim())
        .join(" ");
      const profileName = [student.firstName, student.middleName, student.lastName]
        .filter(value => typeof value === "string" && value.trim())
        .join(" ");
      nameElement.textContent = signedInName || profileName
        ? `Welcome, ${signedInName || profileName}`
        : "Welcome to your student dashboard";

    }


    // --------------------------------------------------------
    // STUDENT PROFILE
    // --------------------------------------------------------

    const profileElement =
      document.querySelector(
        "#profile"
      );


    if (profileElement) {

      profileElement.innerHTML = `

        ${
          student.photoUrl
            ? `
              <div class="student-dashboard-photo">
                <img
                  src="${escapeHTML(student.photoUrl)}"
                  alt="${escapeHTML(
                    `${student.firstName} ${student.lastName}`
                  )}"
                >
              </div>
            `
            : ""
        }

        <article class="card">

          <h3>Student ID</h3>

          <p>
            ${escapeHTML(
              student.studentId
            )}
          </p>

        </article>


        <article class="card">

          <h3>Status</h3>

          <p>
            ${escapeHTML(
              student.status
            )}
          </p>

        </article>


        <article class="card">

          <h3>Class</h3>

          <p>
            ${
              enrollment?.class?.name
                ? escapeHTML(
                    enrollment.class.name
                  )
                : "Not assigned"
            }
          </p>

        </article>


        <article class="card">

          <h3>Session</h3>

          <p>
            ${
              enrollment?.session?.name
                ? escapeHTML(
                    enrollment.session.name
                  )
                : "Not assigned"
            }
          </p>

        </article>


        <article class="card">

          <h3>Gender</h3>

          <p>
            ${
              student.gender
                ? escapeHTML(
                    student.gender
                  )
                : "—"
            }
          </p>

        </article>


        <article class="card">

          <h3>Date of Birth</h3>

          <p>
            ${formatDate(
              student.dateOfBirth
            )}
          </p>

        </article>


        <article class="card">

          <h3>Phone</h3>

          <p>
            ${
              student.phone
                ? escapeHTML(
                    student.phone
                  )
                : "—"
            }
          </p>

        </article>


        <article class="card">

          <h3>Email</h3>

          <p>
            ${escapeHTML(student.email || me.email || "—")}
          </p>

        </article>


        <article class="card">

          <h3>Enrollment History</h3>

          <p>
            ${
              student.enrollments?.length || 0
            }
            recorded placement(s)
          </p>

        </article>

      `;

    }


    // --------------------------------------------------------
    // CLASS DISPLAY
    // --------------------------------------------------------

    const classElement =
      document.querySelector(
        "#student-class"
      );


    if (classElement) {

      if (enrollment) {

        classElement.innerHTML = `

          <article class="card">

            <span class="eyebrow">
              CURRENT PLACEMENT
            </span>

            <h3>
              ${escapeHTML(
                enrollment.class?.name ||
                "Class not assigned"
              )}
            </h3>

            <p>
              Session:
              <strong>
                ${escapeHTML(
                  enrollment.session?.name ||
                  "—"
                )}
              </strong>
            </p>

            <p>
              Status:
              <strong>
                ${escapeHTML(
                  enrollment.status ||
                  "ENROLLED"
                )}
              </strong>
            </p>

          </article>

          <h3>Classmates</h3>
          ${student.classmates?.length
            ? `<ul class="classmate-list">${student.classmates.map(classmate => `<li>${escapeHTML([classmate.firstName, classmate.middleName, classmate.lastName].filter(Boolean).join(" "))}</li>`).join("")}</ul>`
            : '<p>No classmates are currently listed for this class.</p>'}

        `;

      } else {

        classElement.innerHTML = `

          <article class="card">

            <span class="eyebrow">
              CURRENT PLACEMENT
            </span>

            <h3>
              No class assigned
            </h3>

            <p>
              Your current class placement
              has not been recorded yet.
            </p>

          </article>

          <p>Classmates will appear after a current enrollment is recorded.</p>

        `;

      }

    }


    // --------------------------------------------------------
    // ACADEMIC RECORDS
    // --------------------------------------------------------

    const recordsElement =
      document.querySelector(
        "#records"
      );


    if (recordsElement) {

      const records =
        student.academicRecords || [];


      if (!records.length) {

        recordsElement.innerHTML = `

          <div class="empty">

            No academic records
            available yet.

          </div>

        `;

      } else {

        recordsElement.innerHTML = `

          <div class="table-wrap">

            <table>

              <thead>

                <tr>

                  <th>
                    Subject
                  </th>

                  <th>
                    CA
                  </th>

                  <th>
                    Exam
                  </th>

                  <th>
                    Total
                  </th>

                  <th>
                    Grade
                  </th>

                  <th>
                    Remark
                  </th>

                  <th>
                    Session
                  </th>

                  <th>
                    Class
                  </th>

                </tr>

              </thead>


              <tbody>

                ${records.map(record => `

                  <tr>

                    <td>
                      <strong>
                        ${escapeHTML(
                          record.subject
                        )}
                      </strong>
                    </td>

                    <td>
                      ${
                        record.caScore ??
                        "—"
                      }
                    </td>

                    <td>
                      ${
                        record.examScore ??
                        "—"
                      }
                    </td>

                    <td>
                      ${
                        record.totalScore ??
                        "—"
                      }
                    </td>

                    <td>
                      ${
                        record.grade
                          ? escapeHTML(
                              record.grade
                            )
                          : "—"
                      }
                    </td>

                    <td>
                      ${
                        record.remark
                          ? escapeHTML(
                              record.remark
                            )
                          : "—"
                      }
                    </td>

                    <td>
                      ${
                        record.session?.name
                          ? escapeHTML(
                              record.session.name
                            )
                          : "—"
                      }
                    </td>

                    <td>
                      ${escapeHTML(student.enrollments.find(item => item.session?.name === record.session?.name)?.class?.name || "—")}
                    </td>

                  </tr>

                `).join("")}

              </tbody>

            </table>

          </div>

        `;

      }

    }


    // --------------------------------------------------------
    // OPTIONAL ALUMNI HANDLING
    // --------------------------------------------------------

  } catch (error) {

    console.error(
      "PORTAL LOAD ERROR:",
      error
    );


    const profileElement =
      document.querySelector(
        "#profile"
      );


    if (profileElement) {

      profileElement.innerHTML = `

        <div class="empty">

          Unable to load your
          profile right now.
          Please refresh the page.

        </div>

      `;

    }

    for (const selector of ["#student-class", "#records"]) {
      const element = document.querySelector(selector);
      if (element) element.innerHTML = '<p class="empty" role="status">Unable to load this information. Please refresh the page.</p>';
    }

  }

}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {

  const button = document.querySelector("#logout");
  if (button) button.disabled = true;

  try {

    const response = await fetch(
      "/api/auth/logout",
      {
        method: "POST",
        credentials: "include"
      }
    );

    if (!response.ok) throw new Error("Logout failed");

    window.location.replace("/student/login.html");

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

    if (button) {
      button.disabled = false;
      button.textContent = "Logout unavailable. Try again";
    }

  }

}


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const navigation = document.querySelector("#main-navigation");
    if (navigation) {
      const currentPath = new URL(window.location.href).pathname.replace(/\/$/, "/index.html");
      navigation.querySelectorAll("a[href]").forEach(link => {
        const linkPath = new URL(link.href, document.baseURI).pathname.replace(/\/$/, "/index.html");
        if (linkPath === currentPath) link.setAttribute("aria-current", "page");
      });
    }

    load();


    const logoutButton =
      document.querySelector(
        "#logout"
      );


    if (logoutButton) {

      logoutButton.addEventListener(
        "click",
        logout
      );

    }

  }
);
