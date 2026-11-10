export function registerPublicDirectoryRoutes(app, prisma) {
  app.get("/api/events", async (_req, res) => {
    try {
      const events = await prisma.event.findMany({ orderBy: { startsAt: "asc" } });
      return res.json(events);
    } catch (error) {
      console.error("EVENTS ERROR:", error);
      return res.status(500).json({ error: "Unable to load events." });
    }
  });

  app.get("/api/departments", async (_req, res) => {
    try {
      const departments = await prisma.department.findMany({
        select: { id: true, name: true, description: true, head: true, imageUrl: true },
        orderBy: { name: "asc" }
      });
      return res.json(departments);
    } catch (error) {
      console.error("DEPARTMENTS ERROR:", error);
      return res.status(500).json({ error: "Unable to load departments." });
    }
  });
}
