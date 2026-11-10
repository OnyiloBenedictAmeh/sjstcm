import { createHash, randomBytes } from "node:crypto";

const EMAIL_API_URL = "https://api.resend.com/emails";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const GENERIC_RESEND_MESSAGE = "If an account needs verification, a message will be sent.";

export function hashVerificationToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function loginRequiresVerifiedEmail(user) {
  return !user?.emailVerifiedAt;
}

export function createEmailVerificationService(prisma, options = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const from = options.from ?? process.env.EMAIL_FROM;
  const siteUrl = options.siteUrl ?? process.env.PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const isConfigured = Boolean(apiKey && from && siteUrl && fetchImpl);

  async function issueAndSend(user, { enforceCooldown = false } = {}) {
    if (!isConfigured || !user?.id || !user?.email) return false;
    const issuedAt = now();
    if (enforceCooldown) {
      const recent = await prisma.emailVerificationToken.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(issuedAt.getTime() - RESEND_COOLDOWN_MS) } },
        select: { id: true }
      });
      if (recent) return false;
    }

    await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: issuedAt } });

    const token = randomBytes(32).toString("hex");
    const verificationUrl = `${new URL("/verify-email.html", siteUrl).toString()}#token=${token}`;
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashVerificationToken(token),
        expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS)
      }
    });
    const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "there";
    const safeName = name.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    try {
      const response = await fetchImpl(EMAIL_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "Verify your SJSTCM account email",
          html: `<p>Hello ${safeName},</p><p>Verify your email address to activate your account.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours and can only be used once. If you did not request this, you can ignore this message.</p>`
        })
      });
      if (!response.ok) return false;
      return true;
    } catch {
      return false;
    }
  }

  async function verify(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
    const tokenRow = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashVerificationToken(token) } });
    if (!tokenRow || tokenRow.consumedAt || tokenRow.expiresAt <= now()) return false;
    const consumedAt = now();
    return prisma.$transaction(async tx => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: tokenRow.id, consumedAt: null, expiresAt: { gt: consumedAt } },
        data: { consumedAt }
      });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: tokenRow.userId }, data: { emailVerifiedAt: consumedAt } });
      return true;
    }, { isolationLevel: "Serializable" });
  }

  return { isConfigured, issueAndSend, verify };
}

export function registerEmailVerificationRoutes(app, prisma, service, rateLimit) {
  const resendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
  const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  app.post("/api/auth/verify-email", verifyLimiter, async (req, res) => {
    try {
      const verified = await service.verify(req.body?.token);
      if (!verified) return res.status(400).json({ error: "This verification link is invalid, expired or already used. Request a new link and try again." });
      return res.json({ ok: true, message: "Email verified. You can now sign in." });
    } catch {
      return res.status(500).json({ error: "Unable to verify this email right now." });
    }
  });

  app.post("/api/auth/resend-verification", resendLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!service.isConfigured) return res.status(503).json({ error: "Email verification is temporarily unavailable. Please try again later." });
    try {
      if (email && email.length <= 254) {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, emailVerifiedAt: true, student: { select: { firstName: true, lastName: true } }, alumni: { select: { fullName: true } }, staffProfile: { select: { fullName: true } } } });
        if (user && !user.emailVerifiedAt) {
          const name = user.student ? `${user.student.firstName} ${user.student.lastName}` : user.alumni?.fullName || user.staffProfile?.fullName;
          await service.issueAndSend({ ...user, name }, { enforceCooldown: true });
        }
      }
      return res.status(202).json({ ok: true, message: GENERIC_RESEND_MESSAGE });
    } catch {
      return res.status(202).json({ ok: true, message: GENERIC_RESEND_MESSAGE });
    }
  });
}
