export default function Dashboard() {
  const card = "bg-white rounded-2xl shadow-card p-6";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      {/* --- Left side: spans 2 columns --- */}
      <div className="lg:col-span-2 flex flex-col space-y-6">
        {/* Buddy + Activity row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className={card}>
            {/* Study Buddy Suggestions */}
          </section>
          <section className={card}>
            {/* My Activity */}
          </section>
        </div>

        {/* Courses row */}
        <section className={`${card} h-full`}>
          {/* My Courses component */}
        </section>
      </div>

      {/* --- Right side: stack of cards --- */}
      <aside className="flex flex-col space-y-6 h-full">
        <section className={card}>
          {/* Calendar */}
        </section>
        <section className={card}>
          {/* Upcoming Sessions */}
        </section>
        <section className={card}>
          {/* Notes */}
        </section>
      </aside>
    </div>
  );
}
