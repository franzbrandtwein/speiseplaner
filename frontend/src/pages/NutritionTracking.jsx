import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ChevronLeft, ChevronRight, Flame, Beef, Wheat, Droplets, Leaf } from "lucide-react";
import { format, addDays, startOfWeek, subWeeks, addWeeks } from "date-fns";
import { de } from "date-fns/locale";

const NutritionBar = ({ label, value, unit, max, color, icon: Icon }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <Icon className="w-4 h-4" style={{ color }} /> {label}
        </span>
        <span className="text-[var(--text-muted)]">{value} {unit}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

const NutritionTracking = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekData, setWeekData] = useState({});
  const [loading, setLoading] = useState(false);

  const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(currentWeekStart, i);
    return { date: d, dateStr: format(d, "yyyy-MM-dd") };
  });

  useEffect(() => {
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          days.map(d => axios.get(`${API}/nutrition/daily?date=${d.dateStr}`, { withCredentials: true }).catch(() => ({ data: null })))
        );
        const data = {};
        results.forEach((r, i) => {
          if (r.data) data[days[i].dateStr] = r.data;
        });
        setWeekData(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchWeek();
  }, [weekStartStr]);

  const weekTotals = Object.values(weekData).reduce((acc, d) => {
    if (!d?.totals) return acc;
    return {
      calories: acc.calories + (d.totals.calories || 0),
      protein: acc.protein + (d.totals.protein || 0),
      carbs: acc.carbs + (d.totals.carbs || 0),
      fat: acc.fat + (d.totals.fat || 0),
      fiber: acc.fiber + (d.totals.fiber || 0),
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  const daysWithData = Object.values(weekData).filter(d => d?.totals?.calories > 0).length;
  const dailyAvg = daysWithData > 0 ? {
    calories: Math.round(weekTotals.calories / daysWithData),
    protein: Math.round(weekTotals.protein / daysWithData),
    carbs: Math.round(weekTotals.carbs / daysWithData),
    fat: Math.round(weekTotals.fat / daysWithData),
    fiber: Math.round(weekTotals.fiber / daysWithData),
  } : weekTotals;

  const MEAL_LABELS = { breakfast: "Frühstück", lunch: "Mittagessen", dinner: "Abendessen" };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto" data-testid="nutrition-tracking">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold text-[var(--text-primary)] mb-1">
          Nährwerte
        </h1>
        <p className="text-[var(--text-secondary)] mt-1 mb-6">Kalorien und Makros aus deinem Speiseplan</p>

        {/* Week Navigation */}
        <Card className="p-4 mb-6 bg-white border-gray-100">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                {format(currentWeekStart, "d. MMMM", { locale: de })} – {format(addDays(currentWeekStart, 6), "d. MMMM yyyy", { locale: de })}
              </h2>
              <Button variant="link" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="text-emerald-600 text-sm p-0 h-auto">
                Aktuelle Woche
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {/* Weekly Summary */}
        <Card className="p-5 mb-6 bg-white border-gray-100">
          <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4">
            Wochendurchschnitt {daysWithData > 0 && <span className="text-sm font-normal text-[var(--text-muted)]">({daysWithData} Tage mit Daten)</span>}
          </h3>
          <div className="space-y-3">
            <NutritionBar label="Kalorien" value={dailyAvg.calories} unit="kcal" max={2500} color="#f97316" icon={Flame} />
            <NutritionBar label="Protein" value={dailyAvg.protein} unit="g" max={150} color="#ef4444" icon={Beef} />
            <NutritionBar label="Kohlenhydrate" value={dailyAvg.carbs} unit="g" max={300} color="#eab308" icon={Wheat} />
            <NutritionBar label="Fett" value={dailyAvg.fat} unit="g" max={100} color="#3b82f6" icon={Droplets} />
            <NutritionBar label="Ballaststoffe" value={dailyAvg.fiber} unit="g" max={40} color="#22c55e" icon={Leaf} />
          </div>
        </Card>

        {loading && <p className="text-center text-[var(--text-muted)] py-4">Laden...</p>}

        {/* Daily Breakdown */}
        <div className="space-y-3">
          {days.map(({ date, dateStr }) => {
            const dayData = weekData[dateStr];
            const totals = dayData?.totals || {};
            const meals = dayData?.meals || [];
            const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
            const hasCals = totals.calories > 0;

            return (
              <Card key={dateStr} className={`p-4 border-gray-100 ${isToday ? "bg-emerald-50 border-emerald-200" : "bg-white"}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`font-semibold ${isToday ? "text-emerald-700" : "text-[var(--text-primary)]"}`}>
                    {format(date, "EEEE, d. MMM", { locale: de })}
                  </h4>
                  {hasCals && (
                    <span className="text-sm font-semibold text-orange-600">{totals.calories} kcal</span>
                  )}
                </div>
                {hasCals ? (
                  <div className="space-y-1">
                    {meals.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          <span className="text-[var(--text-muted)] text-xs mr-1">{MEAL_LABELS[m.meal_type] || m.meal_type}</span>
                          {m.recipe_name} ({m.portions}p)
                        </span>
                        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                          {m.calories} kcal · {m.protein}g P · {m.carbs}g K · {m.fat}g F
                        </span>
                      </div>
                    ))}
                    <div className="flex gap-4 text-xs text-[var(--text-muted)] pt-1 border-t border-gray-100 mt-1">
                      <span>P: {totals.protein}g</span>
                      <span>K: {totals.carbs}g</span>
                      <span>F: {totals.fat}g</span>
                      <span>Bal: {totals.fiber}g</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">Keine Nährwerte verfügbar</p>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default NutritionTracking;
