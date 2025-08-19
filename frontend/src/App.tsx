// App.tsx or Dashboard.tsx (the layout file)
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import BuddySearch from "./components/BuddySearch";
import Courses from "./components/Courses";
import Calendar from "./components/Calendar";
import UpcomingSessions from "./components/UpcomingSessions";
import Notes from "./components/Notes";

const card = "bg-white rounded-2xl shadow-card p-6";

export default function App() {
  return (
    <div className="min-h-screen">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,#E9FAF1_0%,transparent_50%),radial-gradient(1200px_600px_at_100%_0%,transparent_40%)]" />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />

          <main className="p-6 md:p-8">
            {/* IMPORTANT: items-stretch lets columns become equal height */}
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
          </main>
        </div>
      </div>
    </div>
  );
}
