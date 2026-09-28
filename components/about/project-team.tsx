export type TeamMember = {
  studentId: string;
  nameTh: string;
  nameEn: string;
  roleTh: string;
  roleEn: string;
};

export const TEAM_MEMBERS: TeamMember[] = [
  {
    studentId: "6604022616362",
    nameTh: "ศุภวิชญ์ สถิรวัฒนากร",
    nameEn: "SUPAVICH SATIRAWATTANAKORN",
    roleTh: "ฐานข้อมูลและการพัฒนาด้วย Python",
    roleEn: "Database & Python Development",
  },
  {
    studentId: "6604022616249",
    nameTh: "นนทิญา กองทอง",
    nameEn: "NONTHIYA KONGTHONG",
    roleTh: "พัฒนา Frontend และออกแบบ UX/UI",
    roleEn: "Frontend Development & UX/UI Design",
  },
  {
    studentId: "6604022616281",
    nameTh: "ประสงค์ อมรนิมิต",
    nameEn: "PRASONG AMORNNIMIT",
    roleTh: "งานอ้างอิงรายงานและแหล่งข้อมูลของระบบ",
    roleEn: "Research References & Data Sources",
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function ProjectTeam() {
  return (
    <section id="team" aria-labelledby="project-team-title" className="scroll-mt-24">
      <header className="mx-auto max-w-3xl text-center">
        <p className="section-title">Project Team</p>
        <h2 id="project-team-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          ทีมผู้พัฒนา
        </h2>
        <p className="muted mt-3 text-sm leading-7 sm:text-base">
          โครงการนี้ได้รับการพัฒนาโดยนักศึกษาสาขาวิชาคณิตศาสตร์–คอมพิวเตอร์
          <br className="hidden sm:block" /> คณะวิทยาศาสตร์ประยุกต์
          <br className="hidden sm:block" /> มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ
        </p>
      </header>

      <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TEAM_MEMBERS.map((member) => (
          <article
            key={member.studentId}
            className="card card-pad flex h-full min-w-0 flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--surface-2))] text-sm font-black tracking-wide text-[rgb(var(--brand))]"
            >
              {getInitials(member.nameEn)}
            </div>

            <div className="mt-5 min-w-0">
              <h3 className="break-words text-lg font-bold leading-snug">{member.nameTh}</h3>
              <p className="muted mt-1 break-words text-xs font-semibold tracking-[0.04em]">
                {member.nameEn}
              </p>
            </div>

            <div className="mt-5 min-w-0 border-t border-border pt-4">
              <p className="break-words text-sm font-semibold leading-6">{member.roleTh}</p>
              <p className="muted mt-1 break-words text-xs leading-5">{member.roleEn}</p>
            </div>

            <p className="muted mt-auto pt-5 text-xs tabular-nums">
              รหัสนักศึกษา <span className="font-medium text-fg">{member.studentId}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
