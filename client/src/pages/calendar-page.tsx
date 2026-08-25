import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const TIME_ZONE = "America/Tegucigalpa";
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function hondurasNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

export default function CalendarPage() {
  const [now, setNow] = useState(hondurasNow);
  const [viewDate, setViewDate] = useState(() => {
    const current = hondurasNow();
    return new Date(current.getFullYear(), current.getMonth(), 1);
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(hondurasNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const days = useMemo(() => {
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const count = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [viewDate]);

  const isToday = (day: number) =>
    day === now.getDate() && viewDate.getMonth() === now.getMonth() && viewDate.getFullYear() === now.getFullYear();

  return (
    <div className="flex flex-col flex-1 h-[100dvh] bg-background overflow-hidden">
      <header className="flex-none flex items-center gap-3 px-4 h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <h1 className="font-semibold text-sm">Calendario y hora</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-5 md:p-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <section className="rounded-3xl bg-gradient-to-br from-primary/15 via-background to-background border border-primary/20 p-6 md:p-8">
            <div className="flex items-center gap-3 text-primary mb-4">
              <Clock3 className="w-6 h-6" />
              <span className="font-medium">Hora actual en Honduras</span>
            </div>
            <div className="text-5xl md:text-6xl font-bold tracking-tight tabular-nums">
              {now.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </div>
            <p className="mt-3 text-lg capitalize text-muted-foreground">
              {WEEKDAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} de {now.getFullYear()}
            </p>
            <div className="flex items-center gap-1.5 mt-4 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" /> Zona horaria: America/Tegucigalpa
            </div>
          </section>

          <section className="rounded-3xl border border-border/60 bg-card p-5 md:p-7">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CalendarDays className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold capitalize">
                  {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                </h2>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} aria-label="Mes anterior">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} aria-label="Mes siguiente">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((day) => <div key={day} className="py-2 text-xs font-semibold capitalize text-muted-foreground">{day.slice(0, 3)}</div>)}
              {days.map((day, index) => (
                <div key={`${day}-${index}`} className={`aspect-square flex items-center justify-center rounded-xl text-sm ${day && isToday(day) ? "bg-primary text-primary-foreground font-bold shadow-md" : day ? "hover:bg-muted" : ""}`}>
                  {day}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}