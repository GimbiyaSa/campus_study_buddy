import BuddySearch from '../components/BuddySearch';
import Courses from '../components/Courses';
import Calendar from '../components/Calendar';
import UpcomingSessions from '../components/UpcomingSessions';
import Notes from '../components/Notes';

export default function Dashboard() {
  const card = 'bg-white rounded-2xl shadow-card p-6';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      {/* LEFT: spans 2 cols, courses grows to fill */}
      <div className="lg:col-span-2 flex flex-col gap-6 min-h-full">
        <BuddySearch />

        {/* Make the courses card fill leftover height */}
        <section className={`${card} h-full flex flex-col`}>
          <Courses />
        </section>
      </div>

      {/* RIGHT: mini-grid so the last card (Notes) fills the rest */}
      <aside className="min-h-full">
        <div className="grid grid-rows-[auto_auto_1fr] gap-6 h-full">
          <section className={card}>
            <Calendar />
          </section>
          <section className={card}>
            <UpcomingSessions />
          </section>
          {/* Notes takes remaining space so the column equals left */}
          <section className={`${card} flex flex-col`}>
            <Notes />
          </section>
        </div>
      </aside>
    </div>
  );
}
