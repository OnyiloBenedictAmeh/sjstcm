"use strict";

(() => {
  const carousel = document.querySelector(".home-hero-carousel");
  const ticker = document.querySelector("#breaking-news-ticker");
  const tickerTrack = document.querySelector("#breaking-news-track");
  const tickerViewport = document.querySelector("#breaking-news-viewport");
  const tickerToggle = document.querySelector("#breaking-news-toggle");
  const tickerStatus = document.querySelector("#news-ticker-status");
  const apiBase = window.location.hostname === "onyilobenedictameh.github.io"
    ? "https://sjstcm.vercel.app"
    : window.location.origin;

  if (ticker && tickerTrack && tickerViewport && tickerToggle) {
    let tickerUserPaused = false;
    let tickerHovered = false;
    let tickerFocused = false;
    let tickerReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setTickerPaused = paused => {
      tickerUserPaused = paused;
      syncTickerPause();
    };
    const syncTickerPause = () => {
      const paused = tickerUserPaused || tickerHovered || tickerFocused || tickerReducedMotion;
      ticker.classList.toggle("is-paused", paused);
      tickerToggle.setAttribute("aria-pressed", String(tickerUserPaused));
      tickerToggle.setAttribute("aria-label", tickerUserPaused ? "Resume breaking news ticker" : "Pause breaking news ticker");
      tickerToggle.querySelector("span").textContent = tickerUserPaused ? "▶" : "Ⅱ";
    };
    syncTickerPause();
    tickerToggle.addEventListener("click", () => setTickerPaused(!tickerUserPaused));
    ticker.addEventListener("mouseenter", () => { tickerHovered = true; syncTickerPause(); });
    ticker.addEventListener("mouseleave", () => { tickerHovered = false; syncTickerPause(); });
    ticker.addEventListener("focusin", () => { tickerFocused = true; syncTickerPause(); });
    ticker.addEventListener("focusout", event => { if (!ticker.contains(event.relatedTarget)) { tickerFocused = false; syncTickerPause(); } });
    reducedMotion.addEventListener?.("change", event => { tickerReducedMotion = event.matches; syncTickerPause(); });

    const fetchFeed = async path => {
      const response = await fetch(new URL(path, apiBase), { credentials: apiBase === window.location.origin ? "include" : "omit" });
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      const items = await response.json();
      if (!Array.isArray(items)) throw new Error(`${path} returned invalid data`);
      return items;
    };
    const normalizeHeadline = value => String(value || "").normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const articleUrl = article => `news.html?article=${encodeURIComponent(article.slug || article.id)}`;
    const destinationArticleId = destination => {
      if (!destination) return "";
      try {
        const url = new URL(destination, window.location.href);
        return /(?:^|\/)news\.html$/i.test(url.pathname) ? url.searchParams.get("article") || "" : "";
      } catch { return ""; }
    };
    const createEntry = (headline, href, isBreaking) => {
      const entry = document.createElement("span");
      entry.className = `breaking-news-item${isBreaking ? " is-breaking" : ""}`;
      if (isBreaking) {
        const badge = document.createElement("span");
        badge.className = "breaking-news-badge";
        badge.textContent = "Breaking";
        entry.append(badge);
      }
      const link = document.createElement("a");
      link.href = href || "news.html";
      link.textContent = headline;
      entry.append(link);
      return entry;
    };

    Promise.allSettled([fetchFeed("/api/news"), fetchFeed("/api/breaking-news")]).then(results => {
      const newsResult = results[0], breakingResult = results[1];
      const published = newsResult.status === "fulfilled"
        ? newsResult.value.filter(item => item?.isPublished === true && item.title && (item.slug || item.id))
        : [];
      const announcements = breakingResult.status === "fulfilled"
        ? breakingResult.value.filter(item => item && typeof item.headline === "string" && item.headline.trim())
        : [];
      const items = [];
      const includedNews = new Set();

      for (const announcement of announcements) {
        const normalized = normalizeHeadline(announcement.headline);
        const destinationId = destinationArticleId(announcement.destinationUrl);
        const matchingArticle = published.find(article =>
          (destinationId && [article.slug, article.id].some(id => String(id || "").toLocaleLowerCase() === destinationId.toLocaleLowerCase())) ||
          (normalized && normalized === normalizeHeadline(article.title))
        );
        if (matchingArticle && includedNews.has(matchingArticle.id)) continue;
        if (matchingArticle) includedNews.add(matchingArticle.id);
        items.push({
          headline: announcement.headline,
          href: announcement.destinationUrl || (matchingArticle ? articleUrl(matchingArticle) : "news.html"),
          isBreaking: true
        });
      }

      for (const article of published) {
        if (includedNews.has(article.id)) continue;
        items.push({ headline: article.title, href: articleUrl(article), isBreaking: false });
      }

      tickerTrack.replaceChildren();
      if (items.length) {
        for (const item of items) tickerTrack.append(createEntry(item.headline, item.href, item.isBreaking));
        const duplicate = tickerTrack.cloneNode(true);
        duplicate.removeAttribute("id");
        duplicate.setAttribute("aria-hidden", "true");
        duplicate.inert = true;
        tickerTrack.append(...duplicate.childNodes);
        ticker.classList.add("has-items");
        ticker.hidden = false;
        if (tickerStatus) tickerStatus.textContent = `Loaded ${items.length} current news headlines.`;
        return;
      }

      ticker.classList.remove("has-items");
      if (newsResult.status === "rejected" || breakingResult.status === "rejected") {
        const message = createEntry("News is temporarily unavailable. View all news.", "news.html", false);
        message.classList.add("ticker-feed-error");
        tickerTrack.append(message);
        ticker.hidden = false;
        if (tickerStatus) tickerStatus.textContent = "News is temporarily unavailable.";
      } else {
        ticker.hidden = true;
        if (tickerStatus) tickerStatus.textContent = "There are no current news headlines.";
      }
    });
  }

  if (!carousel || carousel.dataset.initialized === "true") return;

  const slides = [...carousel.querySelectorAll(".home-hero-slide")];
  const dots = [...carousel.querySelectorAll(".home-hero-dots button")];
  const count = carousel.querySelector(".home-hero-count");
  const pauseButton = carousel.querySelector('[data-hero-action="pause"]');
  if (slides.length < 2 || dots.length !== slides.length) return;

  let active = Math.max(0, slides.findIndex(slide => slide.classList.contains("is-active")));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let userPaused = reducedMotion.matches;
  let hovered = false;
  let focused = false;
  let timer;

  carousel.dataset.initialized = "true";

  const isPaused = () => userPaused || hovered || focused || reducedMotion.matches || document.hidden;

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
    slides[active].setAttribute("aria-label", `${active + 1} of ${slides.length}`);
    if (count) count.textContent = `${String(active + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  }

  function schedule() {
    window.clearInterval(timer);
    if (!isPaused()) timer = window.setInterval(() => show(active + 1), 6500);
    if (pauseButton) {
      pauseButton.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
      pauseButton.setAttribute("aria-pressed", String(userPaused));
      pauseButton.innerHTML = `<i class="bx ${userPaused ? "bx-play" : "bx-pause"}" aria-hidden="true"></i>`;
    }
  }

  dots.forEach((dot, index) => dot.addEventListener("click", () => { show(index); schedule(); }));
  carousel.querySelector('[data-hero-action="previous"]')?.addEventListener("click", () => { show(active - 1); schedule(); });
  carousel.querySelector('[data-hero-action="next"]')?.addEventListener("click", () => { show(active + 1); schedule(); });
  pauseButton?.addEventListener("click", () => { userPaused = !userPaused; schedule(); });
  carousel.addEventListener("mouseenter", () => { hovered = true; schedule(); });
  carousel.addEventListener("mouseleave", () => { hovered = false; schedule(); });
  carousel.addEventListener("focusin", () => { focused = true; schedule(); });
  carousel.addEventListener("focusout", event => { if (!carousel.contains(event.relatedTarget)) { focused = false; schedule(); } });
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener?.("change", schedule);
  carousel.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); show(active - 1); schedule(); }
    if (event.key === "ArrowRight") { event.preventDefault(); show(active + 1); schedule(); }
  });

  show(active);
  schedule();
})();
