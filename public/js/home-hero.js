"use strict";

(() => {
  const carousel = document.querySelector(".home-hero-carousel");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll(".home-hero-slide")];
  const dots = [...carousel.querySelectorAll(".home-hero-dots button")];
  const count = carousel.querySelector(".home-hero-count");
  const pauseButton = carousel.querySelector('[data-hero-action="pause"]');
  if (slides.length < 2 || dots.length !== slides.length) return;

  let active = 0;
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timer;

  function show(index) {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const current = i === active;
      slide.hidden = !current;
      slide.classList.toggle("is-active", current);
      slide.setAttribute("aria-hidden", String(!current));
    });
    dots.forEach((dot, i) => {
      const current = i === active;
      dot.classList.toggle("is-active", current);
      dot.setAttribute("aria-pressed", String(current));
    });
    if (count) count.textContent = `${String(active + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  }

  function schedule() {
    window.clearInterval(timer);
    if (!paused) timer = window.setInterval(() => show(active + 1), 6500);
    if (pauseButton) {
      pauseButton.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
      pauseButton.innerHTML = `<i class="bx ${paused ? "bx-play" : "bx-pause"}" aria-hidden="true"></i>`;
    }
  }

  dots.forEach((dot, index) => dot.addEventListener("click", () => show(index)));
  carousel.querySelector('[data-hero-action="previous"]')?.addEventListener("click", () => show(active - 1));
  carousel.querySelector('[data-hero-action="next"]')?.addEventListener("click", () => show(active + 1));
  pauseButton?.addEventListener("click", () => { paused = !paused; schedule(); });
  carousel.addEventListener("mouseenter", () => window.clearInterval(timer));
  carousel.addEventListener("mouseleave", schedule);
  carousel.addEventListener("focusin", () => window.clearInterval(timer));
  carousel.addEventListener("focusout", event => { if (!carousel.contains(event.relatedTarget)) schedule(); });
  document.addEventListener("visibilitychange", () => document.hidden ? window.clearInterval(timer) : schedule());

  show(0);
  schedule();
})();
