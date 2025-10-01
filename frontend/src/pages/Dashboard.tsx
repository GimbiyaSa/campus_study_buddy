import BuddySearch from '../components/BuddySearch';
import Courses from '../components/Courses';
import Calendar from '../components/Calendar';
import UpcomingSessions from '../components/UpcomingSessions';
import Notes from '../components/Notes';

export default function Dashboard() {
  const card = 'bg-white rounded-xl shadow-card border border-gray-200 p-6';

  return (
    <div className="space-y-8">
      {/* 1. Calendar - full width with toggles */}
      <section className={card}>
        <Calendar />
      </section>

      {/* 2. Suggestions + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`${card} lg:col-span-2`}>
          <BuddySearch />
        </section>
        <section className={card}>
          <UpcomingSessions />
        </section>
      </div>

      {/* 3. Courses + Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className={card}>
          <Courses />
        </section>
        <section className={card}>
          <Notes />
        </section>
      </div>
    </div>
  );
}