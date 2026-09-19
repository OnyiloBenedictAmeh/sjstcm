import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureUser(email, role, password) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { role, passwordHash },
    create: { email, passwordHash, role }
  });
}

async function main() {
  const schoolName = process.env.SCHOOL_NAME || "Your School Name";

  const adminPassword = "ChangeMe123!";
  await ensureUser("admin@example.com", "ADMIN", adminPassword);

  for (const name of ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]) {
    await prisma.class.upsert({ where: { name }, update: {}, create: { name } });
  }

  const sessions = [
    { name: "2025/2026", isCurrent: false },
    { name: "2026/2027", isCurrent: true }
  ];

  for (const session of sessions) {
    await prisma.session.upsert({
      where: { name: session.name },
      update: { isCurrent: session.isCurrent },
      create: { name: session.name, isCurrent: session.isCurrent }
    });
  }

  const departments = [
    ["Sciences", "Science and laboratory-based subjects."],
    ["Arts & Humanities", "Languages, literature, history and creative subjects."],
    ["Commercial", "Business, accounting and entrepreneurship."],
    ["Technology", "Computer studies, ICT and technology subjects."]
  ];

  for (const [name, description] of departments) {
    await prisma.department.upsert({
      where: { name }, update: {}, create: { name, description }
    });
  }

  await prisma.setting.upsert({
    where: { key: "school_name" },
    update: { value: schoolName },
    create: { key: "school_name", value: schoolName }
  });

  const studentEntries = [
    { studentId: "STU-2026-001", firstName: "Ada", middleName: "Amina", lastName: "Nwankwo", email: "ada.nwankwo@student.school", phone: "+2348021110001", status: "ACTIVE" },
    { studentId: "STU-2026-002", firstName: "Daniel", middleName: "Tari", lastName: "Okafor", email: "daniel.okafor@student.school", phone: "+2348021110002", status: "ACTIVE" },
    { studentId: "STU-2026-003", firstName: "Chiamaka", middleName: "Ebere", lastName: "Agu", email: "chiamaka.agu@student.school", phone: "+2348021110003", status: "ACTIVE" }
  ];

  for (const student of studentEntries) {
    const user = await ensureUser(student.email, "STUDENT", "StudentPass123!");
    const data = await prisma.student.upsert({
      where: { studentId: student.studentId },
      update: {
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        status: student.status,
        userId: user.id
      },
      create: {
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        status: student.status,
        userId: user.id
      }
    });

    const currentSession = await prisma.session.findUnique({ where: { name: "2026/2027" } });
    const className = student.studentId.endsWith("001") ? "SS 1" : student.studentId.endsWith("002") ? "SS 2" : "SS 3";
    const classData = await prisma.class.findUnique({ where: { name: className } });

    if (currentSession && classData) {
      await prisma.enrollment.upsert({
        where: { studentId_sessionId: { studentId: data.id, sessionId: currentSession.id } },
        update: { classId: classData.id, status: "ENROLLED" },
        create: { studentId: data.id, classId: classData.id, sessionId: currentSession.id, status: "ENROLLED" }
      });
    }
  }

  const alumniEntries = [
    { studentId: "ALM-2021-001", firstName: "Grace", lastName: "Adebayo", graduationYear: 2021, occupation: "Software Engineer", company: "LumiWorks", location: "Abuja", bio: "Product-minded engineer and mentor for young girls in STEM." },
    { studentId: "ALM-2020-015", firstName: "Kingsley", lastName: "Eze", graduationYear: 2020, occupation: "Civil Engineer", company: "NorthBridge Construction", location: "Kano", bio: "Passionate about sustainable infrastructure and community development." },
    { studentId: "ALM-2019-010", firstName: "Mira", lastName: "Ibrahim", graduationYear: 2019, occupation: "Medical Doctor", company: "Crestcare Hospital", location: "Kaduna", bio: "Committed to community health outreach and patient care." }
  ];

  for (const alumni of alumniEntries) {
    const student = await prisma.student.upsert({
      where: { studentId: alumni.studentId },
      update: {
        firstName: alumni.firstName,
        lastName: alumni.lastName,
        status: "ALUMNI",
        email: `${alumni.firstName.toLowerCase()}.${alumni.lastName.toLowerCase()}@alumni.school`
      },
      create: {
        studentId: alumni.studentId,
        firstName: alumni.firstName,
        lastName: alumni.lastName,
        status: "ALUMNI",
        email: `${alumni.firstName.toLowerCase()}.${alumni.lastName.toLowerCase()}@alumni.school`
      }
    });

    await prisma.alumni.upsert({
      where: { studentId: student.id },
      update: {
        graduationYear: alumni.graduationYear,
        occupation: alumni.occupation,
        company: alumni.company,
        location: alumni.location,
        bio: alumni.bio,
        isPublic: true
      },
      create: {
        studentId: student.id,
        graduationYear: alumni.graduationYear,
        occupation: alumni.occupation,
        company: alumni.company,
        location: alumni.location,
        bio: alumni.bio,
        isPublic: true
      }
    });
  }

  const newsItems = [
    {
      title: "School Science Fair Opens This Friday",
      slug: "school-science-fair-opens-this-friday",
      excerpt: "Students will showcase robotics, prototypes and practical experiments across science departments.",
      content: "The annual school science fair will open this Friday with projects spanning robotics, environment, health and STEM innovation. Parents, guardians and community partners are invited to explore student-led solutions and celebrate creativity.",
      imageUrl: "https://images.unsplash.com/photo-1503676260728-1d2f6f0f2b5b?auto=format&fit=crop&w=1200&q=80",
      publishedAt: new Date("2026-09-18T09:00:00.000Z"),
      isPublished: true
    },
    {
      title: "New Digital Learning Lab Commissioned",
      slug: "new-digital-learning-lab-commissioned",
      excerpt: "A modern ICT space has been opened to strengthen digital literacy and project-based learning.",
      content: "The school recently commissioned a new digital learning lab with updated workstations, internet access and collaborative tools. The facility will support coding, research and multimedia learning for learners in junior and senior classes.",
      imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
      publishedAt: new Date("2026-09-12T09:00:00.000Z"),
      isPublished: true
    },
    {
      title: "Inter-House Debate Finals Set for Next Week",
      slug: "inter-house-debate-finals-set-for-next-week",
      excerpt: "Students are preparing for a high-energy finale focused on leadership, public speaking and civic engagement.",
      content: "This year’s inter-house debate finals will bring together the best speakers from across the school. The event is expected to highlight research, confidence and disciplined argumentation in a highly competitive format.",
      imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
      publishedAt: new Date("2026-09-08T09:00:00.000Z"),
      isPublished: true
    }
  ];

  for (const item of newsItems) {
    await prisma.news.upsert({
      where: { slug: item.slug },
      update: item,
      create: item
    });
  }

  const eventItems = [
    {
      title: "Open Day for Parents and Guardians",
      description: "Meet our teachers, tour the campus and learn about student support systems and academic pathways.",
      location: "Main Assembly Hall",
      startsAt: new Date("2026-09-20T10:00:00.000Z"),
      endsAt: new Date("2026-09-20T13:00:00.000Z"),
      imageUrl: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80"
    },
    {
      title: "STEM Workshop with Industry Partners",
      description: "Students will engage in coding, robotics and problem-solving sessions with visiting professionals.",
      location: "Innovation Centre",
      startsAt: new Date("2026-09-27T09:30:00.000Z"),
      endsAt: new Date("2026-09-27T12:30:00.000Z"),
      imageUrl: "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&w=1200&q=80"
    },
    {
      title: "School Cultural Festival",
      description: "A celebration of music, dance, drama and traditional performance from across the school community.",
      location: "School Field",
      startsAt: new Date("2026-10-03T13:00:00.000Z"),
      endsAt: new Date("2026-10-03T18:30:00.000Z"),
      imageUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80"
    }
  ];

  for (const event of eventItems) {
    const existing = await prisma.event.findFirst({ where: { title: event.title } });
    if (existing) {
      await prisma.event.update({ where: { id: existing.id }, data: event });
    } else {
      await prisma.event.create({ data: event });
    }
  }

  const galleryItems = [
    { title: "Science Lab", imageUrl: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80", caption: "Learners explore practical science in a modern lab." },
    { title: "Classroom Learning", imageUrl: "https://images.unsplash.com/photo-1503676260728-1d2f6f0f2b5b?auto=format&fit=crop&w=1200&q=80", caption: "Focused lessons and collaborative study groups." },
    { title: "School Event", imageUrl: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80", caption: "Students connect with families during the school open day." },
    { title: "Digital Skills", imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80", caption: "Students develop coding and digital confidence." }
  ];

  for (const item of galleryItems) {
    const existing = item.title ? await prisma.galleryPhoto.findFirst({ where: { title: item.title } }) : null;
    if (existing) {
      await prisma.galleryPhoto.update({ where: { id: existing.id }, data: item });
    } else {
      await prisma.galleryPhoto.create({ data: item });
    }
  }
}

main().finally(() => prisma.$disconnect());
