import { useState, useRef, useEffect, type ComponentType } from "react";
import {
  Menu, X, LayoutDashboard, UserPlus, GraduationCap,
  LineChart, CalendarClock, Settings
} from "lucide-react";
import logo from "../assets/logo.jpg";

type NavLink = { label: string; href: string; icon: ComponentType<{ className?: string }> };

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Dashboard");
  const drawerRef = useRef<HTMLDivElement>(null);

  const navLinks: NavLink[] = [
    { label: "Dashboard",           href: "#/dashboard", icon: LayoutDashboard },
    { label: "Find study partners", href: "#/partners",  icon: UserPlus },
    { label: "My courses",          href: "#/courses",   icon: GraduationCap },
    { label: "Track my progress",   href: "#/progress",  icon: LineChart },
    { label: "Plan study sessions", href: "#/sessions",  icon: CalendarClock },
    { label: "Settings",            href: "#/settings",  icon: Settings },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>("a, button");
    const first = focusable?.[0], last = focusable?.[focusable.length - 1];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
      if (e.key === "Tab" && first && last) {
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const LinkItem = ({ link }: { link: NavLink }) => {
    const Icon = link.icon;
    const active = activeItem === link.label;
    return (
      <a
        href={link.href}
        onClick={() => setActiveItem(link.label)}
        className={[
          "group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200",
          active
            ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
            : "text-gray-600 hover:bg-brand-50/70 hover:text-brand-700"
        ].join(" ")}
        aria-current={active ? "page" : undefined}
      >
        <Icon
          className={`w-5 h-5 transition-colors duration-200 ${
            active
              ? "text-brand-600"
              : "text-gray-400 group-hover:text-brand-600"
          }`}
        />
        <span>{link.label}</span>
      </a>
    );
  };

  return (
    <>
      {/* Desktop */}
      <aside
        className="hidden md:flex w-64 flex-col 
                   bg-gradient-to-t from-brand-50 via-white to-brand-50/80
                   border-r border-gray-100"
      >
        <div className="px-6 pt-6 pb-4 flex items-center gap-3">
          <img src={logo} alt="Campus Study Buddy" className="w-10 h-10 rounded-lg shadow-soft" />
          <div>
            <h2 className="font-bold">Campus Study Buddy</h2>
            <p className="text-xs text-gray-500">Your study companion</p>
          </div>
        </div>

        <div className="px-6">
          <div className="h-px bg-gray-100 my-3" />
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1">
          {navLinks.map((l) => <LinkItem key={l.label} link={l} />)}
        </nav>
      </aside>

      {/* Mobile top bar (fixed) */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40
                   flex items-center justify-between
                   bg-gradient-to-r from-brand-50 via-white to-brand-50/80
                   border-b px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <img src={logo} className="w-8 h-8 rounded-md" alt="Campus Study Buddy" />
          <h1 className="font-semibold">Campus Study Buddy</h1>
        </div>
        <button aria-label="Open menu" onClick={() => setIsOpen(true)}>
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Spacer so content doesn’t hide under fixed bar */}
      <div className="md:hidden h-[56px]" />

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
          <aside
            ref={drawerRef}
            className="relative w-72 flex flex-col 
                       bg-gradient-to-t from-brand-50 via-white to-brand-50/80
                       border-r z-50"
            aria-label="Mobile navigation"
          >
            <div className="p-6 flex items-center gap-3">
              <img src={logo} className="w-10 h-10 rounded-lg" alt="Campus Study Buddy" />
              <h2 className="font-bold text-lg">Campus Study Buddy</h2>
              <button onClick={() => setIsOpen(false)} className="ml-auto" aria-label="Close menu">
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-1">
              {navLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => { setActiveItem(l.label); setIsOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                    activeItem === l.label
                      ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                      : "text-gray-600 hover:bg-brand-50/70 hover:text-brand-700"
                  }`}
                  aria-current={activeItem === l.label ? "page" : undefined}
                >
                  <l.icon
                    className={`w-5 h-5 transition-colors duration-200 ${
                      activeItem
                        ? "text-brand-600"
                        : "text-gray-400 group-hover:text-brand-600"
                    }`}
                  />
                  {l.label}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
