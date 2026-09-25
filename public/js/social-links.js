"use strict";

// Add the school's profile URLs here when its social accounts are ready.
window.SCHOOL_SOCIAL_LINKS = {
  facebook: "",
  x: "",
  youtube: "",
  whatsapp: "",
  instagram: ""
};

document.querySelectorAll("[data-school-social]").forEach(link => {
  const url = window.SCHOOL_SOCIAL_LINKS[link.dataset.schoolSocial];
  if (!url) return;

  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.removeAttribute("aria-disabled");
  link.removeAttribute("title");
});
