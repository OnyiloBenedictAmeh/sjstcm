"use strict";

/* =========================================================
   PUBLIC SCHOOL WEBSITE — MAIN.JS
   ========================================================= */


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const $$ = (selector, parent = document) =>
  [...parent.querySelectorAll(selector)];


const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char])
  );


function formatDate(value, fallback = "ANNOUNCEMENT") {

  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}


function formatShortDate(value) {

  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


function emptyCard(label, text) {

  return `
    <div class="empty">
      <strong>${esc(label)}</strong>
      <p>${esc(text)}</p>
    </div>
  `;
}


function setHTML(selector, html) {

  const element = $(selector);

  if (!element) return;

  element.innerHTML = html;
}


function appendHTML(selector, html) {

  const element = $(selector);

  if (!element) return;

  element.insertAdjacentHTML(
    "beforeend",
    html
  );
}


/* =========================================================
   API HELPER
   ========================================================= */

async function api(url, options = {}) {

  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };


  /*
   * Only send JSON Content-Type when the body
   * is actually JSON.
   *
   * This keeps the helper compatible with
   * FormData uploads elsewhere in the project.
   */

  if (
    config.body &&
    !(config.body instanceof FormData) &&
    typeof config.body === "string"
  ) {

    config.headers["Content-Type"] =
      "application/json";

  }


  const response =
    await fetch(
      url,
      config
    );


  let data = null;


  try {

    data =
      await response.json();

  } catch {

    data = null;

  }


  if (!response.ok) {

    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed (${response.status})`
    );

  }


  return data;

}


/* =========================================================
   SITE NAVIGATION
   ========================================================= */

function bindMobileNavigation(header) {

  const toggle =
    $(".menu-toggle", header);

  const navigation =
    $("nav", header);


  if (!toggle || !navigation) {
    return;
  }


  toggle.addEventListener(
    "click",
    () => {

      const isOpen =
        navigation.classList.toggle(
          "open"
        );


      navigation.classList.toggle(
        "is-open",
        isOpen
      );


      toggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );


      toggle.setAttribute(
        "aria-label",
        isOpen
          ? "Close navigation menu"
          : "Open navigation menu"
      );

    }
  );


  $$(`a`, navigation).forEach(
    link => {

      link.addEventListener(
        "click",
        () => {

          navigation.classList.remove(
            "open",
            "is-open"
          );


          toggle.setAttribute(
            "aria-expanded",
            "false"
          );


          toggle.setAttribute(
            "aria-label",
            "Open navigation menu"
          );

        }
      );

    }
  );

}


function nav() {

  const container =
    $("#site-nav");

  if (!container) {

    const existingHeader =
      $(".site-header");


    if (existingHeader) {
      bindMobileNavigation(existingHeader);
    }


    return;

  }

  const sitePrefix = "";


  container.innerHTML = `

    <header class="site-header">

      <a
        class="brand"
        href="${sitePrefix}index.html"
        aria-label="St. Joseph's Science and Technical College, Makurdi"
      >
        <img
          src="${sitePrefix}assets/images/logo.png"
          alt="St. Joseph's Science and Technical College logo"
          class="school-logo"
        >

        <span class="brand-text">
          <span class="brand-short">SJSTC</span>
          <span class="brand-full">St. Joseph's Science and Technical College</span>
          <span class="brand-location">Makurdi</span>
        </span>
      </a>


      <button
        class="menu-toggle"
        type="button"
        aria-label="Open navigation menu"
        aria-expanded="false"
      >
        <i class="bx bx-menu" aria-hidden="true"></i>
      </button>


      <nav aria-label="Main navigation">

        <a href="${sitePrefix}index.html">Home</a>

        <a href="${sitePrefix}about.html">
          About
        </a>

        <a href="${sitePrefix}academics.html">
          Academics
        </a>

        <a href="${sitePrefix}departments.html">
          Departments
        </a>

        <a href="${sitePrefix}news.html">
          News
        </a>

        <a href="${sitePrefix}events.html">
          Events
        </a>

        <a href="${sitePrefix}gallery.html">
          Gallery
        </a>

        <a href="${sitePrefix}contact.html">
          Contact
        </a>

        <a href="${sitePrefix}alumni/index.html">
          Alumni
        </a>

        <a
          class="nav-button"
          href="${sitePrefix}student/login.html"
        >
          Portal
        </a>

      </nav>

    </header>

  `;


  const header =
    $(".site-header", container);


  if (!header) {
    return;
  }


  const navigation =
    $("nav", header);


  bindMobileNavigation(header);


  /* -------------------------------------------------------
     ACTIVE PAGE
     ------------------------------------------------------- */

  const currentPath =
    window.location.pathname.replace(
      /\/$/,
      ""
    ) || "/";


  $$("a", navigation).forEach(
    link => {

      const href =
        link.getAttribute("href");

      if (!href) return;


      let linkPath = href;

      try {

        linkPath =
          new URL(
            href,
            window.location.origin
          ).pathname.replace(
            /\/$/,
            ""
          ) || "/";

      } catch {
        return;
      }


      if (linkPath === currentPath) {

        link.classList.add(
          "active"
        );

        link.setAttribute(
          "aria-current",
          "page"
        );

      }

    }
  );

}


/* =========================================================
   NEWS
   ========================================================= */

function newsCard(news) {

  const title =
    esc(news.title);


  const excerpt =
    esc(
      news.excerpt ||
      news.content ||
      "Read the latest school announcement."
    );


  return `

    <article class="card news-card">

      <span class="eyebrow">
        ${esc(
          news.publishedAt
            ? formatShortDate(news.publishedAt)
            : "ANNOUNCEMENT"
        )}
      </span>


      <h3>
        ${title}
      </h3>


      <p>
        ${excerpt.slice(0, 180)}
        ${excerpt.length > 180 ? "…" : ""}
      </p>

    </article>

  `;

}


async function loadNews() {

  const homeList =
    $("#news-list");

  const allList =
    $("#all-news");


  if (!homeList && !allList) {
    return;
  }


  try {

    const news =
      await api(
        "/api/news"
      );


    const items =
      Array.isArray(news)
        ? news
        : [];


    if (homeList) {

      setHTML(
        "#news-list",
        items.length
          ? items
              .slice(0, 3)
              .map(newsCard)
              .join("")
          : emptyCard(
              "News",
              "No news has been published yet."
            )
      );

    }


    if (allList) {

      setHTML(
        "#all-news",
        items.length
          ? items
              .map(newsCard)
              .join("")
          : emptyCard(
              "News",
              "No news has been published yet."
            )
      );

    }


  } catch (error) {

    console.error(
      "NEWS LOAD ERROR:",
      error
    );


    if (homeList) {

      setHTML(
        "#news-list",
        emptyCard(
          "News",
          "News could not be loaded right now."
        )
      );

    }


    if (allList) {

      setHTML(
        "#all-news",
        emptyCard(
          "News",
          "News could not be loaded right now."
        )
      );

    }

  }

}


/* =========================================================
   EVENTS
   ========================================================= */

function eventCard(event) {

  return `

    <article class="card event-card">

      <span class="eyebrow">
        ${esc(
          formatShortDate(
            event.startsAt
          )
        )}
      </span>


      <h3>
        ${esc(event.title)}
      </h3>


      <p>
        <strong>
          ${esc(
            event.location ||
            "School campus"
          )}
        </strong>
      </p>


      <p>
        ${esc(
          event.description ||
          "See the school calendar for details."
        )}
      </p>

    </article>

  `;

}


async function loadEvents() {

  const homeList =
    $("#events-list");

  const allList =
    $("#all-events");


  if (!homeList && !allList) {
    return;
  }


  try {

    const events =
      await api(
        "/api/events"
      );


    const items =
      Array.isArray(events)
        ? events
        : [];


    if (homeList) {

      setHTML(
        "#events-list",
        items.length
          ? items
              .slice(0, 3)
              .map(eventCard)
              .join("")
          : emptyCard(
              "Events",
              "No upcoming events yet."
            )
      );

    }


    if (allList) {

      setHTML(
        "#all-events",
        items.length
          ? items
              .map(eventCard)
              .join("")
          : emptyCard(
              "Events",
              "No upcoming events yet."
            )
      );

    }


  } catch (error) {

    console.error(
      "EVENTS LOAD ERROR:",
      error
    );


    if (homeList) {

      setHTML(
        "#events-list",
        emptyCard(
          "Events",
          "Events could not be loaded right now."
        )
      );

    }


    if (allList) {

      setHTML(
        "#all-events",
        emptyCard(
          "Events",
          "Events could not be loaded right now."
        )
      );

    }

  }

}


/* =========================================================
   DEPARTMENTS
   ========================================================= */

function departmentCard(department) {

  return `

    <article class="card">

      <h3>
        ${esc(department.name)}
      </h3>


      <p>
        ${esc(
          department.description ||
          "Department information is being updated."
        )}
      </p>


      ${
        department.head
          ? `
            <small>
              <strong>Head:</strong>
              ${esc(department.head)}
            </small>
          `
          : ""
      }

    </article>

  `;

}


async function loadDepartments() {

  const container =
    $("#departments-list");


  if (!container) return;


  try {

    const departments =
      await api(
        "/api/departments"
      );


    const items =
      Array.isArray(departments)
        ? departments
        : [];


    setHTML(
      "#departments-list",
      items.length
        ? items
            .map(departmentCard)
            .join("")
        : emptyCard(
            "Departments",
            "Department information is being updated."
          )
    );


  } catch (error) {

    console.error(
      "DEPARTMENTS LOAD ERROR:",
      error
    );


    setHTML(
      "#departments-list",
      emptyCard(
        "Departments",
        "Department information could not be loaded."
      )
    );

  }

}


/* =========================================================
   GALLERY
   ========================================================= */

function galleryCard(photo) {

  return `

    <figure>

      <img
        src="${esc(photo.imageUrl)}"
        alt="${esc(
          photo.title ||
          "School photo"
        )}"
        loading="lazy"
      >


      ${
        photo.caption ||
        photo.title
          ? `
            <figcaption>
              ${esc(
                photo.caption ||
                photo.title
              )}
            </figcaption>
          `
          : ""
      }

    </figure>

  `;

}


async function loadGallery() {

  const container =
    $("#gallery-list");


  if (!container) return;


  try {

    const gallery =
      await api(
        "/api/gallery"
      );


    const items =
      Array.isArray(gallery)
        ? gallery
        : [];


    setHTML(
      "#gallery-list",
      items.length
        ? items
            .map(galleryCard)
            .join("")
        : emptyCard(
            "Gallery",
            "The school gallery is coming soon."
          )
    );


  } catch (error) {

    console.error(
      "GALLERY LOAD ERROR:",
      error
    );


    setHTML(
      "#gallery-list",
      emptyCard(
        "Gallery",
        "Gallery could not be loaded right now."
      )
    );

  }

}


/* =========================================================
   ALUMNI
   ========================================================= */

function alumniCard(alumni) {

  const student =
    alumni.student || {};


  const fullName =
    [
      student.firstName,
      student.middleName,
      student.lastName
    ]
      .filter(Boolean)
      .join(" ");


  return `

    <article class="card alumni-card">

      ${
        alumni.photoUrl ||
        student.photoUrl
          ? `
            <img
              src="${esc(
                alumni.photoUrl ||
                student.photoUrl
              )}"
              alt="${esc(fullName)}"
              loading="lazy"
            >
          `
          : ""
      }


      <h3>
        ${esc(
          fullName ||
          "Alumni"
        )}
      </h3>


      <p>
        Class of
        <strong>
          ${esc(
            alumni.graduationYear ||
            "—"
          )}
        </strong>
      </p>


      <p>
        ${esc(
          alumni.occupation ||
          "Alumnus"
        )}
      </p>


      ${
        alumni.company
          ? `
            <small>
              ${esc(alumni.company)}
            </small>
          `
          : ""
      }

    </article>

  `;

}


async function loadAlumni() {

  const alumniList =
    $("#alumni-list");

  const yearsList =
    $("#class-years");


  if (!alumniList && !yearsList) {
    return;
  }


  if (alumniList) {

    try {

      const alumni =
        await api(
          "/api/alumni"
        );


      const items =
        Array.isArray(alumni)
          ? alumni
          : [];


      setHTML(
        "#alumni-list",
        items.length
          ? items
              .slice(0, 9)
              .map(alumniCard)
              .join("")
          : emptyCard(
              "Alumni",
              "The alumni directory is coming soon."
            )
      );


    } catch (error) {

      console.error(
        "ALUMNI LOAD ERROR:",
        error
      );


      setHTML(
        "#alumni-list",
        emptyCard(
          "Alumni",
          "The alumni directory could not be loaded."
        )
      );

    }

  }


  if (yearsList) {

    try {

      const years =
        await api(
          "/api/alumni/years"
        );


      const items =
        Array.isArray(years)
          ? years
          : [];


      setHTML(
        "#class-years",
        items.length
          ? items
              .map(year => `
                <a
                  class="card"
                  href="${sitePrefix}alumni/profile.html?year=${encodeURIComponent(year)}"
                >

                  <h2>
                    Class of ${esc(year)}
                  </h2>

                  <p>
                    Explore alumni from ${esc(year)}.
                  </p>

                </a>
              `)
              .join("")
          : emptyCard(
              "Alumni",
              "No graduating classes have been published yet."
            )
      );


    } catch (error) {

      console.error(
        "ALUMNI YEARS ERROR:",
        error
      );


      setHTML(
        "#class-years",
        emptyCard(
          "Alumni",
          "Graduating class information could not be loaded."
        )
      );

    }

  }

}


/* =========================================================
   SCHOOL SETTINGS
   ========================================================= */

async function loadSchoolSettings() {

  try {

    const settings =
      await api(
        "/api/settings/public"
      );


    const schoolName =
      String(
        settings?.school_name ||
        settings?.SCHOOL_NAME ||
        settings?.schoolName ||
        "St. Joseph's Science and Technical College, Makurdi"
      ).trim();


    const brandText =
      schoolName.toUpperCase();


    /* -------------------------------------------------------
       BRAND
       ------------------------------------------------------- */

    $$(".brand").forEach(
      element => {

        const fullName =
          $(".brand-full", element);

        if (fullName) {
          fullName.textContent = schoolName;
        } else if (!$("img", element)) {
          element.textContent = brandText;
        }

      }
    );


    /* -------------------------------------------------------
       SCHOOL NAME ELEMENTS
       ------------------------------------------------------- */

    $$(
      "[data-school-name]"
    ).forEach(
      element => {

        element.textContent =
          schoolName;

      }
    );


    /* -------------------------------------------------------
       FOOTER
       ------------------------------------------------------- */

    const footerStrong =
      $(".footer strong");


    if (footerStrong) {

      footerStrong.textContent =
        brandText;

    }


    const footerSmall =
      $(".footer small");


    if (footerSmall) {

      footerSmall.innerHTML = `
        ©
        <span id="year">
          ${new Date().getFullYear()}
        </span>
        ${esc(schoolName)}.
        All rights reserved.
      `;

    }


    /* -------------------------------------------------------
       PAGE TITLE
       ------------------------------------------------------- */

    if (
      document.title &&
      document.title.includes(
        "St. Joseph's Science and Technical College, Makurdi"
      )
    ) {

      document.title =
        document.title.replace(
          "St. Joseph's Science and Technical College, Makurdi",
          schoolName
        );

    }


  } catch (error) {

    console.warn(
      "SCHOOL SETTINGS LOAD WARNING:",
      error
    );

  }

}


/* =========================================================
   CONTACT FORM
   ========================================================= */

function setupContactForm() {

  const form =
    $("#contact-form");


  if (!form) return;


  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const status =
        $("#form-status");


      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );


      if (status) {

        status.textContent =
          "Sending your message...";

      }


      if (submitButton) {

        submitButton.disabled =
          true;

      }


      try {

        const data =
          Object.fromEntries(
            new FormData(form)
          );


        await api(
          "/api/contact",
          {
            method: "POST",
            body: JSON.stringify(data)
          }
        );


        if (status) {

          status.textContent =
            "Thank you. Your message has been received.";

        }


        form.reset();


      } catch (error) {

        console.error(
          "CONTACT FORM ERROR:",
          error
        );


        if (status) {

          status.textContent =
            error.message ||
            "Unable to send your message right now.";

        }


      } finally {

        if (submitButton) {

          submitButton.disabled =
            false;

        }

      }

    }
  );

}


/* =========================================================
   YEAR
   ========================================================= */

function setCurrentYear() {

  $$(".current-year, #year").forEach(
    element => {

      if (
        !element.textContent.trim() ||
        element.classList.contains(
          "current-year"
        )
      ) {

        element.textContent =
          new Date().getFullYear();

      }

    }
  );

}


/* =========================================================
   INITIALIZE
   ========================================================= */

async function load() {

  nav();

  setCurrentYear();

  await loadSchoolSettings();

  setCurrentYear();

  await Promise.allSettled([

    loadNews(),

    loadEvents(),

    loadDepartments(),

    loadGallery(),

    loadAlumni()

  ]);

  setupContactForm();

}


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    load
  );

} else {

  load();

}
