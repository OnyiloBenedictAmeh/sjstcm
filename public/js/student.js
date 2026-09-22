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


function getCurrentEnrollment(student) {

  if (
    !student?.enrollments?.length
  ) {

    return null;

  }


  return student.enrollments[0];

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
          credentials: "include"
        }
      );


    if (!authResponse.ok) {

      window.location.href =
        "student/login.html";

      return;

    }


    const me =
      await authResponse.json();


    // --------------------------------------------------------
    // ROLE CHECK
    // --------------------------------------------------------

    if (
      ![
        "STUDENT",
        "ALUMNI"
      ].includes(me.role)
    ) {

      window.location.href =
        "admin/admin.html";

      return;

    }


    // --------------------------------------------------------
    // LOAD STUDENT PROFILE
    // --------------------------------------------------------

    const profileResponse =
      await fetch(
        "/api/student/profile",
        {
          credentials: "include"
        }
      );


    if (
      profileResponse.status === 401
    ) {

      window.location.href =
        "student/login.html";

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

    const enrollment =
      getCurrentEnrollment(
        student
      );


    // --------------------------------------------------------
    // WELCOME MESSAGE
    // --------------------------------------------------------

    const nameElement =
      document.querySelector(
        "#name"
      );


    if (nameElement) {

      nameElement.textContent =
        `Welcome, ${student.firstName} ${student.lastName}`;

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
            ${
              student.email
                ? escapeHTML(
                    student.email
                  )
                : "—"
            }
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

    if (
      me.role === "ALUMNI"
    ) {

      document.body.classList.add(
        "alumni-portal"
      );

    }


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

  }

}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {

  try {

    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
        credentials: "include"
      }
    );

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

  } finally {

    window.location.href =
      "index.html";

  }

}


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const menuToggle =
      document.querySelector(
        ".menu-toggle"
      );

    const navigation =
      document.querySelector(
        "#main-navigation"
      );

    if (menuToggle && navigation) {

      menuToggle.addEventListener(
        "click",
        () => {

          const isOpen =
            navigation.classList.toggle(
              "is-open"
            );

          navigation.classList.toggle(
            "open",
            isOpen
          );

          menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
          );

          menuToggle.setAttribute(
            "aria-label",
            isOpen
              ? "Close navigation menu"
              : "Open navigation"
          );

        }
      );

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