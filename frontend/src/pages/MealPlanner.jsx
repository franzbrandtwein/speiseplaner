import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { 
  ChevronLeft, ChevronRight, Plus, X, Save, ShoppingCart, 
  Coffee, UtensilsCrossed, Moon, ChefHat 
} from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";

const MealPlanner = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [mealPlan, setMealPlan] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");

  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(currentWeekStart, i),
    dateStr: format(addDays(currentWeekStart, i), "yyyy-MM-dd")
  }));

  useEffect(() => {
    fetchData();
  }, [weekStartStr]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [planRes, recipesRes] = await Promise.all([
        axios.get(`${API}/mealplans?week_start=${weekStartStr}`, { withCredentials: true }),
        axios.get(`${API}/recipes`, { withCredentials: true })
      ]);
      setMealPlan(planRes.data);
      setRecipes(recipesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const getMealForSlot = (dateStr, mealType) => {
    const day = mealPlan?.days?.find(d => d.date === dateStr);
    return day?.[mealType] || null;
  };

  const openSlotDialog = (dateStr, mealType) => {
    setSelectedSlot({ dateStr, mealType });
    setSearchQuery("");
    setDialogOpen(true);
  };

  const selectRecipe = (recipe) => {
    if (!selectedSlot || !mealPlan) return;

    const updatedDays = mealPlan.days.map(day => {
      if (day.date === selectedSlot.dateStr) {
        return {
          ...day,
          [selectedSlot.mealType]: {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.name,
            portions: 2
          }
        };
      }
      return day;
    });

    setMealPlan({ ...mealPlan, days: updatedDays });
    setDialogOpen(false);
    setSelectedSlot(null);
  };

  const clearSlot = (dateStr, mealType) => {
    if (!mealPlan) return;

    const updatedDays = mealPlan.days.map(day => {
      if (day.date === dateStr) {
        return { ...day, [mealType]: null };
      }
      return day;
    });

    setMealPlan({ ...mealPlan, days: updatedDays });
  };

  const updatePortions = (dateStr, mealType, portions) => {
    if (!mealPlan) return;

    const updatedDays = mealPlan.days.map(day => {
      if (day.date === dateStr && day[mealType]) {
        return {
          ...day,
          [mealType]: { ...day[mealType], portions: parseInt(portions) || 2 }
        };
      }
      return day;
    });

    setMealPlan({ ...mealPlan, days: updatedDays });
  };

  const saveMealPlan = async () => {
    if (!mealPlan) return;

    setSaving(true);
    try {
      await axios.post(`${API}/mealplans`, {
        week_start: weekStartStr,
        days: mealPlan.days
      }, { withCredentials: true });
      toast.success("Speiseplan gespeichert");
    } catch (error) {
      console.error("Error saving meal plan:", error);
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const filteredRecipes = recipes.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const mealTypes = [
    { key: "breakfast", label: "Frühstück", icon: Coffee },
    { key: "lunch", label: "Mittagessen", icon: UtensilsCrossed },
    { key: "dinner", label: "Abendessen", icon: Moon }
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="animate-fade-in" data-testid="meal-planner-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Speiseplan
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Plane deine Mahlzeiten für die Woche
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/shopping-list">
              <Button variant="outline" className="btn-secondary">
                <ShoppingCart className="w-4 h-4" /> Einkaufsliste
              </Button>
            </Link>
            <Button onClick={saveMealPlan} disabled={saving} className="btn-primary" data-testid="save-plan-button">
              <Save className="w-4 h-4" />
              {saving ? "Speichert..." : "Speichern"}
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        <Card className="p-4 mb-6 bg-white border-gray-100">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={goToPreviousWeek} data-testid="prev-week-button">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            
            <div className="text-center">
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                {format(currentWeekStart, "d. MMMM", { locale: de })} – {format(addDays(currentWeekStart, 6), "d. MMMM yyyy", { locale: de })}
              </h2>
              <Button 
                variant="link" 
                onClick={goToCurrentWeek}
                className="text-emerald-600 text-sm p-0 h-auto"
              >
                Aktuelle Woche
              </Button>
            </div>
            
            <Button variant="ghost" onClick={goToNextWeek} data-testid="next-week-button">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 gap-2 mb-2">
              <div></div>
              {days.map(({ date, dateStr }) => {
                const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                return (
                  <div 
                    key={dateStr}
                    className={`text-center p-3 rounded-xl ${isToday ? "bg-emerald-100" : "bg-[var(--bg-subtle)]"}`}
                  >
                    <p className={`text-sm ${isToday ? "text-emerald-700 font-medium" : "text-[var(--text-muted)]"}`}>
                      {format(date, "EEE", { locale: de })}
                    </p>
                    <p className={`font-heading text-lg font-semibold ${isToday ? "text-emerald-700" : "text-[var(--text-primary)]"}`}>
                      {format(date, "d")}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Meal Rows */}
            {mealTypes.map(({ key, label, icon: Icon }) => (
              <div key={key} className="grid grid-cols-8 gap-2 mb-2">
                <div className="flex items-center gap-2 p-3 text-[var(--text-secondary)]">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{label}</span>
                </div>
                
                {days.map(({ dateStr }) => {
                  const meal = getMealForSlot(dateStr, key);
                  
                  return (
                    <Card 
                      key={`${dateStr}-${key}`}
                      className={`p-3 min-h-[100px] flex flex-col transition-all cursor-pointer hover:border-emerald-200 ${
                        meal ? "bg-white border-gray-100" : "bg-[var(--bg-subtle)] border-dashed border-gray-200"
                      }`}
                      onClick={() => !meal && openSlotDialog(dateStr, key)}
                      data-testid={`meal-slot-${dateStr}-${key}`}
                    >
                      {meal ? (
                        <>
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-medium text-sm text-[var(--text-primary)] line-clamp-2 flex-1">
                              {meal.recipe_name}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearSlot(dateStr, key);
                              }}
                              className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                              data-testid={`clear-slot-${dateStr}-${key}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="mt-auto flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">Portionen:</span>
                            <Input
                              type="number"
                              min="1"
                              value={meal.portions || 2}
                              onChange={(e) => {
                                e.stopPropagation();
                                updatePortions(dateStr, key, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-14 h-6 text-xs p-1"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <Plus className="w-5 h-5 text-[var(--text-muted)]" />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Recipe Selection Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                Rezept auswählen
              </DialogTitle>
            </DialogHeader>
            
            <Input
              placeholder="Rezepte suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
              data-testid="recipe-search-dialog"
            />
            
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-8">
                  <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">
                    {recipes.length === 0 ? "Noch keine Rezepte vorhanden" : "Keine Rezepte gefunden"}
                  </p>
                </div>
              ) : (
                filteredRecipes.map(recipe => (
                  <button
                    key={recipe.recipe_id}
                    onClick={() => selectRecipe(recipe)}
                    className="w-full p-3 text-left rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all flex items-center gap-3"
                    data-testid={`select-recipe-${recipe.recipe_id}`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {recipe.image_url ? (
                        <img src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ChefHat className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">{recipe.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{recipe.category}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default MealPlanner;
