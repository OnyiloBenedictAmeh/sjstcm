"use strict";

function setMenuOpen(toggle, navigation, isOpen) {
  navigation.classList.toggle("open", isOpen);
  navigation.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

function normalizedPath(pathname) {
  if (pathname === "/") return "/index.html";
  return pathname.replace(/\/$/, "") || "/index.html";
}

function bindMenuToggle(header, navigation) {
  const toggle = header.querySelector(".menu-toggle");
  if (!toggle) return;

  toggle.setAttribute("aria-controls", navigation.id);
  if (toggle.dataset.menuToggleBound === "true") return;

  toggle.addEventListener("click", () => {
    const isOpening = toggle.getAttribute("aria-expanded") !== "true";
    if (isOpening) navigation.querySelectorAll(".nav-group[open]").forEach(group => group.removeAttribute("open"));
    setMenuOpen(toggle, navigation, isOpening);
  });
  toggle.dataset.menuToggleBound = "true";
}

function renderSiteNavigation() {
  const currentPath = normalizedPath(window.location.pathname);

  document.querySelectorAll(".site-header").forEach(header => {
    const navigation = header.querySelector("nav");
    if (!navigation) return;

    navigation.id = "main-navigation";
    navigation.setAttribute("aria-label", "Main navigation");
    navigation.innerHTML = `
      <a href="index.html">Home</a>
      <details class="nav-group" name="site-navigation-menu">
        <summary>School</summary>
        <div class="nav-submenu">
          <a href="about.html">About the School</a>
          <a href="gallery.html">School Life</a>
        </div>
      </details>
      <details class="nav-group" name="site-navigation-menu">
        <summary>Learning</summary>
        <div class="nav-submenu">
          <a href="academics.html">Academics</a>
          <a href="departments.html">Departments</a>
          <a href="admissions.html">Admissions</a>
        </div>
      </details>
      <details class="nav-group" name="site-navigation-menu">
        <summary>News &amp; Events</summary>
        <div class="nav-submenu">
          <a href="news.html">News</a>
          <a href="events.html">Events</a>
        </div>
      </details>
      <a href="alumni/index.html">Alumni</a>
      <a href="contact.html">Contact</a>
      <a class="nav-button" href="student/login.html">Student Portal</a>
    `;

    navigation.addEventListener("click", event => {
      const summary = event.target instanceof Element
        ? event.target.closest(".nav-group > summary")
        : null;
      const selectedGroup = summary?.parentElement;
      if (!selectedGroup) return;

      window.requestAnimationFrame(() => {
        if (!selectedGroup.open) return;
        navigation.querySelectorAll(".nav-group[open]").forEach(group => {
          if (group !== selectedGroup) group.open = false;
        });
      });
    });

    bindMenuToggle(header, navigation);

    navigation.querySelectorAll("a[href]").forEach(link => {
      const linkPath = normalizedPath(new URL(link.href, document.baseURI).pathname);
      const isAlumniPage = linkPath === "/alumni/index.html" && currentPath.startsWith("/alumni/");
      const isStudentPage = linkPath === "/student/login.html" && currentPath.startsWith("/student/");
      if (linkPath !== currentPath && !isAlumniPage && !isStudentPage) return;

      link.setAttribute("aria-current", "page");
      link.classList.add("active");
      link.closest(".nav-group")?.classList.add("active");
    });

    navigation.querySelectorAll(".nav-group").forEach(group => {
      if (group.querySelector("a[aria-current='page']")) {
        group.querySelector("summary")?.setAttribute("aria-current", "page");
      }
    });
  });
}

window.renderSiteNavigation = renderSiteNavigation;
renderSiteNavigation();

function initializeBackToTop() {
  if (!document.querySelector(".site-header") || document.querySelector(".back-to-top")) return;

  const button = document.createElement("button");
  button.className = "back-to-top";
  button.type = "button";
  button.setAttribute("aria-label", "Back to top");
  button.innerHTML = '<span aria-hidden="true">↑</span>';
  button.hidden = window.scrollY <= 400;
  button.addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", () => {
    button.hidden = window.scrollY <= 400;
  }, { passive: true });
  document.body.append(button);
}

initializeBackToTop();

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest(".site-header nav a");
  if (link) {
    const header = link.closest(".site-header");
    const toggle = header?.querySelector(".menu-toggle");
    const navigation = header?.querySelector("nav");
    if (toggle && navigation) setMenuOpen(toggle, navigation, false);
    navigation?.querySelectorAll(".nav-group[open]").forEach(group => group.removeAttribute("open"));
    return;
  }

  if (!target?.closest(".site-header")) {
    document.querySelectorAll(".site-header .nav-group[open]").forEach(group => group.removeAttribute("open"));
    document.querySelectorAll('.site-header .menu-toggle[aria-expanded="true"]').forEach(toggle => {
      const navigation = toggle.closest(".site-header")?.querySelector("nav");
      if (navigation) setMenuOpen(toggle, navigation, false);
    });
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const openGroup = document.querySelector(".site-header .nav-group[open]");
  if (openGroup) {
    openGroup.removeAttribute("open");
    openGroup.querySelector("summary")?.focus();
  }

  const toggle = document.querySelector('.site-header .menu-toggle[aria-expanded="true"]');
  const navigation = toggle?.closest(".site-header")?.querySelector("nav");
  if (toggle && navigation) {
    setMenuOpen(toggle, navigation, false);
    toggle.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth <= 1120) return;
  document.querySelectorAll(".site-header .menu-toggle[aria-expanded='true']").forEach(toggle => {
    const navigation = toggle.closest(".site-header")?.querySelector("nav");
    if (navigation) setMenuOpen(toggle, navigation, false);
  });
});
