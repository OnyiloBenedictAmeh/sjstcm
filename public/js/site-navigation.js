"use strict";

function setMenuOpen(toggle, navigation, isOpen) {
  navigation.classList.toggle("open", isOpen);
  navigation.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

document.addEventListener("click", event => {
  const toggle = event.target.closest(".menu-toggle");
  if (toggle) {
    const header = toggle.closest(".site-header");
    const navigation = header?.querySelector("nav");
    if (!navigation) return;
    setMenuOpen(toggle, navigation, toggle.getAttribute("aria-expanded") !== "true");
    return;
  }

  const link = event.target.closest(".site-header nav a");
  if (!link) return;
  const header = link.closest(".site-header");
  const toggleButton = header?.querySelector(".menu-toggle");
  const navigation = header?.querySelector("nav");
  if (toggleButton && navigation) setMenuOpen(toggleButton, navigation, false);
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const header = document.querySelector('.site-header .menu-toggle[aria-expanded="true"]')?.closest(".site-header");
  const toggle = header?.querySelector(".menu-toggle");
  const navigation = header?.querySelector("nav");
  if (!toggle || !navigation) return;
  setMenuOpen(toggle, navigation, false);
  toggle.focus();
});
