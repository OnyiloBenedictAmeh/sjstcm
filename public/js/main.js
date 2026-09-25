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


/* =========================================================
   API BASE
   ========================================================= */

const isLocalApiHost = ["localhost", "127.0.0.1", "::1"].includes(
  window.location.hostname
);

const API_BASE_URL = isLocalApiHost
  ? window.location.origin
  : "https://sjstcm-apinpm-install-andand-npx-prisma.onrender.com";


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

  const requestUrl = new URL(url, API_BASE_URL);
  const sameOrigin = requestUrl.origin === window.location.origin;

  const config = {
    ...options,
    // Public API calls use cookies only when they remain same-origin.
    // Production public pages do not need authenticated cookies.
    credentials: sameOrigin ? "include" : "omit",
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
      requestUrl,
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

function markCurrentNavigationLink() {
  const currentPath = new URL(window.location.href).pathname.replace(/\/$/, "/index.html");
  $$("#main-navigation a[href]").forEach(link => {
    const linkPath = new URL(link.href, document.baseURI).pathname.replace(/\/$/, "/index.html");
    if (linkPath === currentPath) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}


function nav() {

  const container =
    $("#site-nav");

  if (!container) return;

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

        <a href="${sitePrefix}admissions.html">Admissions</a>

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


  const excerptText =
    String(
      news.excerpt ||
      news.content ||
      "Read the latest school announcement."
    ).trim();

  const excerpt =
    esc(excerptText.slice(0, 180));


  return `

    <article class="card news-card">

      ${
        news.imageUrl
          ? `<img src="${esc(news.imageUrl)}" alt="${title}" loading="lazy">`
          : ""
      }

      <span class="eyebrow">
        ${esc(
          news.publishedAt
            ? formatShortDate(news.publishedAt)
            : "ANNOUNCEMENT"
        )}
      </span>


      <h3><a href="news.html?article=${encodeURIComponent(news.slug || news.id)}">${title}</a></h3>


      <p>
        ${excerpt}
        ${excerptText.length > 180 ? "…" : ""}
      </p>

    </article>

  `;

}


async function loadNews() {

  const homeList =
    $("#news-list");

  const allList =
    $("#all-news");
  const featured =
    $("#featured-news");


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

    const requestedSlug = new URLSearchParams(window.location.search).get("article");
    const articleContainer = $("#news-article");
    if (articleContainer && requestedSlug) {
      if (featured) featured.hidden = true;
      const listContainer = $("#all-news");
      if (listContainer) listContainer.hidden = true;
      const article = items.find(item => item.slug === requestedSlug || item.id === requestedSlug);

      if (article) {
        const date = article.publishedAt ? formatDate(article.publishedAt) : "";
        articleContainer.hidden = false;
        articleContainer.innerHTML = `
          <a class="text-link" href="news.html">← All news</a>
          ${article.imageUrl ? `<img class="article-image" src="${esc(article.imageUrl)}" alt="${esc(article.title)}" loading="lazy">` : ""}
          ${date ? `<p class="eyebrow"><time datetime="${esc(article.publishedAt)}">${esc(date)}</time></p>` : ""}
          <h2>${esc(article.title)}</h2>
          <div class="article-content">${esc(article.content || article.excerpt || "").split(/\r?\n\s*\r?\n/).map(paragraph => `<p>${paragraph.replace(/\r?\n/g, "<br>")}</p>`).join("")}</div>
        `;
        document.title = `${article.title} | School News`;
      } else {
        articleContainer.hidden = false;
        articleContainer.innerHTML = `${emptyCard("Article unavailable", "This article may have been removed or is no longer published.")}<a class="text-link" href="news.html">Browse all news</a>`;
      }
    }


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

      if (featured && items.length && !requestedSlug) {
        featured.innerHTML = `<div class="section-heading"><div><span class="eyebrow">FEATURED UPDATE</span></div></div>${newsCard(items[0])}`;
      } else if (featured && !items.length) {
        featured.innerHTML = emptyCard("News", "No news articles have been published yet.");
      }

      setHTML(
        "#all-news",
        items.length > (featured ? 1 : 0)
          ? items
              .slice(featured ? 1 : 0)
              .map(newsCard)
              .join("")
          : items.length && featured
            ? `<p class="empty">More school updates will appear here.</p>`
          : emptyCard(
              "News",
              "No news articles have been published yet."
            )
      );

    }


  } catch (error) {

    console.error(
      "NEWS LOAD ERROR:",
      error
    );

    if (new URLSearchParams(window.location.search).has("article")) {
      const articleContainer = $("#news-article");
      if (articleContainer) {
        articleContainer.hidden = false;
        articleContainer.innerHTML = `${emptyCard("Article unavailable", "We couldn't load this article. Please try again later.")}<a class="text-link" href="news.html">Browse all news</a>`;
      }
      if (featured) featured.hidden = true;
      if (allList) allList.hidden = true;
      return;
    }


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
      if (featured) featured.innerHTML = emptyCard("News", "News could not be loaded right now. Please try again later.");

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

      ${
        event.imageUrl
          ? `<img src="${esc(event.imageUrl)}" alt="${esc(event.title)}" loading="lazy">`
          : ""
      }

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
            "Location to be announced"
          )}
        </strong>
      </p>

      <p><time datetime="${esc(event.startsAt)}">${esc(new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))}</time></p>


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
  const pastList =
    $("#past-events");


  if (!homeList && !allList && !pastList) {
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

    const now = Date.now();
    const upcomingItems = items.filter(event => {
      const startsAt = new Date(event.startsAt).getTime();
      const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : startsAt;
      return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt >= now;
    });
    const pastItems = items.filter(event => {
      const startsAt = new Date(event.startsAt).getTime();
      const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : startsAt;
      return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt < now;
    });


    if (homeList) {

      setHTML(
        "#events-list",
        upcomingItems.length
          ? upcomingItems
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
        upcomingItems.length
          ? upcomingItems
              .map(eventCard)
              .join("")
          : emptyCard(
              "Events",
              "No upcoming events have been announced yet."
            )
      );

    }

    if (pastList) {
      pastList.innerHTML = pastItems.length
        ? pastItems.map(eventCard).join("")
        : emptyCard("Past events", "There are no past events to display yet.");
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

    if (pastList) {
      pastList.innerHTML = emptyCard("Past events", "Past events could not be loaded right now.");
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

  const containers = [
    $("#departments-list"),
    $("#home-departments")
  ].filter(Boolean);


  if (!containers.length) return;


  try {

    const departments =
      await api(
        "/api/departments"
      );


    const items =
      Array.isArray(departments)
        ? departments
        : [];


    containers.forEach(container => {
      const visibleItems = container.id === "home-departments" ? items.slice(0, 3) : items;
      container.innerHTML = visibleItems.length
        ? visibleItems.map(departmentCard).join("")
        : emptyCard("Departments", "Department information has not been published yet.");
    });


  } catch (error) {

    console.error(
      "DEPARTMENTS LOAD ERROR:",
      error
    );


    containers.forEach(container => {
      container.innerHTML = emptyCard("Departments", "Department information could not be loaded. Please try again later.");
    });

  }

}


/* =========================================================
   GALLERY
   ========================================================= */

function galleryCard(photo) {

  return `

    <figure>

      <button class="gallery-preview" type="button" data-image="${esc(photo.imageUrl)}" data-caption="${esc(photo.caption || photo.title || "School photo")}" aria-label="View ${esc(photo.title || "school photo")}">
        <img src="${esc(photo.imageUrl)}" alt="${esc(photo.title || photo.caption || "School photo")}" loading="lazy">
      </button>


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

  const containers = [
    $("#gallery-list"),
    $("#home-gallery")
  ].filter(Boolean);


  if (!containers.length) return;

  document.addEventListener("click", event => {
    const preview = event.target.closest(".gallery-preview");
    if (!preview) return;

    const dialog = $("#gallery-viewer");
    if (!dialog) return;
    const image = $("#gallery-viewer-image", dialog);
    const caption = $("#gallery-viewer-caption", dialog);
    if (!image || !caption) return;

    image.src = preview.dataset.image;
    image.alt = preview.dataset.caption;
    caption.textContent = preview.dataset.caption;
    dialog.showModal();
  });

  $("#close-gallery-viewer")?.addEventListener("click", () => $("#gallery-viewer")?.close());


  try {

    const gallery =
      await api(
        "/api/gallery"
      );


    const items =
      Array.isArray(gallery)
        ? gallery
        : [];


    containers.forEach(container => {
      const visibleItems =
        container.id === "home-gallery"
          ? items.slice(0, 6)
          : items;

      container.innerHTML =
        visibleItems.length
          ? visibleItems.map(galleryCard).join("")
          : emptyCard(
              "Gallery",
              "The school gallery is coming soon."
            );
    });


  } catch (error) {

    console.error(
      "GALLERY LOAD ERROR:",
      error
    );


    containers.forEach(container => {
      container.innerHTML = emptyCard(
        "Gallery",
        "Gallery could not be loaded right now."
      );
    });

  }

}


/* =========================================================
   ALUMNI
   ========================================================= */

function alumniCard(alumni) {

  const student =
    alumni.student || {};


  const fullName =
    alumni.fullName || alumni.name || [
      student.firstName,
      student.middleName,
      student.lastName
    ]
      .filter(Boolean)
      .join(" ");


  const period = alumni.entryYear && alumni.exitYear
    ? `${alumni.entryYear}–${alumni.exitYear} Set`
    : alumni.graduationYear
      ? `${alumni.graduationYear} Set`
      : "School years to be confirmed";

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
        <strong>
          ${esc(
          period || alumni.graduationYear ||
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

      ${alumni.lastClass ? `<p><strong>Last class:</strong> ${esc(alumni.lastClass)}</p>` : ""}
      ${alumni.department || alumni.programme ? `<p><strong>Department:</strong> ${esc(alumni.department || alumni.programme)}</p>` : ""}
      ${alumni.thenPhotoUrl || alumni.nowPhotoUrl ? `
        <div class="then-now-photos" aria-label="Then and now photos">
          ${alumni.thenPhotoUrl ? `<figure><img src="${esc(alumni.thenPhotoUrl)}" alt="${esc(fullName)} at school" loading="lazy"><figcaption>Then</figcaption></figure>` : ""}
          ${alumni.nowPhotoUrl ? `<figure><img src="${esc(alumni.nowPhotoUrl)}" alt="${esc(fullName)} now" loading="lazy"><figcaption>Now</figcaption></figure>` : ""}
        </div>` : ""}


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

  const classList =
    $("#alumni-profile");


  if (!alumniList && !yearsList && !classList) {
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
                  href="alumni/profile.html?year=${encodeURIComponent(year)}"
                >

                  <h2>
                    ${esc(year)} Set
                  </h2>

                  <p>
                    Exit year ${esc(year)}. Entry years and historical details may not be available yet.
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


  if (classList) {
    const requestedYear =
      new URLSearchParams(window.location.search).get("year");
    const year =
      /^\d{4}$/.test(requestedYear || "")
        ? requestedYear
        : "";

    try {
      const alumni = await api(
        year
          ? `/api/alumni?year=${encodeURIComponent(year)}`
          : "/api/alumni"
      );
      const items = Array.isArray(alumni) ? alumni : [];
      const heading = year ? `${year} Set` : "Alumni directory";
      const description = year
        ? `Alumni records grouped by exit year ${year}. Entry year and other historical details may not be available yet.`
        : "Members of our alumni community.";

      document.title = `${heading} | St. Joseph's Science and Technical College, Makurdi`;

      classList.innerHTML = `
        <div class="section-heading">
          <div>
            <span class="eyebrow">ALUMNI COMMUNITY</span>
            <h1 id="profile-heading">${esc(heading)}</h1>
            <p class="lead">${esc(description)}</p>
          </div>
        </div>
        <div class="grid">
          ${items.length
            ? items.map(alumniCard).join("")
            : emptyCard(
                "Alumni",
                year
                  ? `No public alumni profiles were found for ${year}.`
                  : "No public alumni profiles are available yet."
              )}
        </div>
      `;
    } catch (error) {
      console.error("ALUMNI CLASS LOAD ERROR:", error);
      classList.innerHTML = emptyCard(
        "Alumni",
        "This alumni class could not be loaded right now."
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


      if (!form.reportValidity()) return;

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
            "We couldn't send your message. Please try again later.";

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
  markCurrentNavigationLink();

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
