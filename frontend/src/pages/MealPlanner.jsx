import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
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
  Coffee, UtensilsCrossed, Moon, ChefHat, ArrowLeft,
  Search, Minus
} from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";

// ─── Slot Configuration Dialog ───────────────────────────────────────────────
const SlotConfigDialog = ({ open, onClose, onConfirm, initialSlot, recipes }) => {
  const [phase, setPhase] = useState("pick"); // "pick" | "configure"
  const [mainRecipe, setMainRecipe] = useState(null);
  const [mainPortions, setMainPortions] = useState(2);
  const [sideDishes, setSideDishes] = useState([]);
  const [mainSearch, setMainSearch] = useState("");
  const [sideSearch, setSideSearch] = useState("");
  const [showSideDropdown, setShowSideDropdown] = useState(false);

  // Reset whenever dialog opens
  useEffect(() => {
    if (!open) return;
    if (initialSlot?.recipe_id) {
      const recipe = recipes.find(r => r.recipe_id === initialSlot.recipe_id);
      setMainRecipe(recipe || { recipe_id: initialSlot.recipe_id, name: initialSlot.recipe_name });
      setMainPortions(initialSlot.portions || 2);
      setSideDishes(initialSlot.side_dishes || []);
      setPhase("configure");
    } else {
      setMainRecipe(null);
      setMainPortions(2);
      setSideDishes([]);
      setPhase("pick");
    }
    setMainSearch("");
    setSideSearch("");
    setShowSideDropdown(false);
  }, [open]);

  const pickRecipe = (recipe) => {
    setMainRecipe(recipe);
    setMainPortions(recipe.portions || 2);
    // Pre-populate with recipe's linked side dishes
    const linked = (recipe.side_dishes || []).map(sid => {
      const r = recipes.find(r => r.recipe_id === sid);
      return r ? { recipe_id: r.recipe_id, recipe_name: r.name, portions: r.portions || 2 } : null;
    }).filter(Boolean);
    setSideDishes(linked);
    setPhase("configure");
  };

  const addSideDish = (recipe) => {
    if (sideDishes.find(s => s.recipe_id === recipe.recipe_id)) return;
    setSideDishes(prev => [...prev, {
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.name,
      portions: recipe.portions || 2
    }]);
    setSideSearch("");
    setShowSideDropdown(false);
  };

  const removeSideDish = (recipe_id) => {
    setSideDishes(prev => prev.filter(s => s.recipe_id !== recipe_id));
  };

  const updateSidePortions = (recipe_id, val) => {
    setSideDishes(prev => prev.map(s =>
      s.recipe_id === recipe_id ? { ...s, portions: Math.max(1, parseInt(val) || 1) } : s
    ));
  };

  const handleConfirm = () => {
    if (!mainRecipe) return;
    onConfirm({
      recipe_id: mainRecipe.recipe_id,
      recipe_name: mainRecipe.name,
      portions: mainPortions,
      side_dishes: sideDishes,
    });
    onClose();
  };

  const filteredMain = recipes.filter(r =>
    r.name.toLowerCase().includes(mainSearch.toLowerCase())
  );

  const filteredSide = recipes.filter(r =>
    r.recipe_id !== mainRecipe?.recipe_id &&
    !sideDishes.find(s => s.recipe_id === r.recipe_id) &&
    (sideSearch === "" || r.name.toLowerCase().includes(sideSearch.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            {phase === "configure" && (
              <button
                onClick={() => setPhase("pick")}
                className="p-1 rounded-lg hover:bg-gray-100 mr-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {phase === "pick" ? "Rezept auswählen" : "Mahlzeit konfigurieren"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Phase 1: Pick main recipe ── */}
        {phase === "pick" && (
          <div className="flex flex-col flex-1 overflow-hidden gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rezepte suchen…"
                value={mainSearch}
                onChange={e => setMainSearch(e.target.value)}
                className="pl-9"
                autoFocus
                data-testid="recipe-search-dialog"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {filteredMain.length === 0 ? (
                <div className="text-center py-10">
                  <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">
                    {recipes.length === 0 ? "Noch keine Rezepte vorhanden" : "Keine Rezepte gefunden"}
                  </p>
                </div>
              ) : (
                filteredMain.map(recipe => (
                  <button
                    key={recipe.recipe_id}
                    onClick={() => pickRecipe(recipe)}
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
                    {recipe.side_dishes?.length > 0 && (
                      <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        {recipe.side_dishes.length} Beilage{recipe.side_dishes.length !== 1 ? "n" : ""}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Phase 2: Configure portions + side dishes ── */}
        {phase === "configure" && mainRecipe && (
          <div className="flex flex-col flex-1 overflow-hidden gap-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">

              {/* Main recipe block */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-emerald-100 flex-shrink-0">
                    {mainRecipe.image_url ? (
                      <img src={mainRecipe.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{mainRecipe.name}</p>
                    <p className="text-xs text-emerald-600">{mainRecipe.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
                    Portionen:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMainPortions(p => Math.max(1, p - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input
                      type="number"
                      min="1"
                      value={mainPortions}
                      onChange={e => setMainPortions(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 h-8 text-center text-sm font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setMainPortions(p => p + 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Side dishes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Beilagen
                    {sideDishes.length > 0 && (
                      <span className="ml-2 text-xs text-emerald-600 font-normal">({sideDishes.length})</span>
                    )}
                  </h3>
                </div>

                {/* Existing side dishes */}
                {sideDishes.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {sideDishes.map(sd => (
                      <div
                        key={sd.recipe_id}
                        className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2"
                      >
                        {(() => {
                          const r = recipes.find(r => r.recipe_id === sd.recipe_id);
                          return r?.image_url ? (
                            <img src={r.image_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">🥗</div>
                          );
                        })()}
                        <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate min-w-0">
                          {sd.recipe_name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => updateSidePortions(sd.recipe_id, sd.portions - 1)}
                            className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <Input
                            type="number"
                            min="1"
                            value={sd.portions}
                            onChange={e => updateSidePortions(sd.recipe_id, e.target.value)}
                            className="w-14 h-7 text-center text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateSidePortions(sd.recipe_id, sd.portions + 1)}
                            className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSideDish(sd.recipe_id)}
                            className="w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 ml-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add side dish search */}
                <div className="relative">
                  <div className="flex items-center gap-2 border border-dashed border-gray-300 hover:border-emerald-400 focus-within:border-emerald-400 rounded-xl px-3 py-2 bg-white transition-colors">
                    <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Beilage hinzufügen…"
                      value={sideSearch}
                      onChange={e => { setSideSearch(e.target.value); setShowSideDropdown(true); }}
                      onFocus={() => setShowSideDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSideDropdown(false), 200)}
                      className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400 text-[var(--text-primary)]"
                    />
                  </div>
                  {showSideDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                      {filteredSide.slice(0, 6).map(r => (
                        <button
                          key={r.recipe_id}
                          type="button"
                          onMouseDown={() => addSideDish(r)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
                        >
                          {r.image_url ? (
                            <img src={r.image_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">🍽️</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{r.category}</p>
                          </div>
                          <Plus className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        </button>
                      ))}
                      {filteredSide.length === 0 && (
                        <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">Keine Rezepte gefunden</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Confirm button */}
            <Button onClick={handleConfirm} className="btn-primary w-full mt-1">
              Übernehmen
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Slot Cell ────────────────────────────────────────────────────────────────
const SlotCell = ({ meal, onOpen, onClear, onUpdatePortions, onUpdateSidePortions, onRemoveSide, dateStr, mealKey }) => {
  if (!meal) {
    return (
      <Card
        className="p-3 min-h-[100px] flex flex-col transition-all cursor-pointer hover:border-emerald-200 bg-[var(--bg-subtle)] border-dashed border-gray-200"
        onClick={onOpen}
        data-testid={`meal-slot-${dateStr}-${mealKey}`}
      >
        <div className="flex-1 flex items-center justify-center">
          <Plus className="w-5 h-5 text-[var(--text-muted)]" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="p-3 min-h-[100px] flex flex-col bg-white border-gray-100 transition-all"
      data-testid={`meal-slot-${dateStr}-${mealKey}`}
    >
      {/* Main recipe */}
      <div className="flex justify-between items-start gap-1 mb-2">
        <button
          className="font-medium text-xs text-[var(--text-primary)] line-clamp-2 flex-1 text-left hover:text-emerald-700 transition-colors"
          onClick={onOpen}
        >
          {meal.recipe_name}
        </button>
        <button
          onClick={onClear}
          className="p-0.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600 flex-shrink-0"
          data-testid={`clear-slot-${dateStr}-${mealKey}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main portions */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] text-[var(--text-muted)]">Portionen:</span>
        <Input
          type="number"
          min="1"
          value={meal.portions || 2}
          onChange={e => onUpdatePortions(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="w-12 h-5 text-xs p-1"
        />
      </div>

      {/* Side dishes */}
      {meal.side_dishes?.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {meal.side_dishes.map(sd => (
            <div key={sd.recipe_id} className="flex items-center gap-1 group">
              <span className="text-[10px] text-emerald-700 flex-1 truncate">↳ {sd.recipe_name}</span>
              <Input
                type="number"
                min="1"
                value={sd.portions || 2}
                onChange={e => onUpdateSidePortions(sd.recipe_id, e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-10 h-5 text-[10px] p-1 flex-shrink-0"
              />
              <button
                onClick={() => onRemoveSide(sd.recipe_id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 rounded text-red-300 hover:text-red-500 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
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

  const getMealForSlot = (dateStr, mealType) => {
    const day = mealPlan?.days?.find(d => d.date === dateStr);
    return day?.[mealType] || null;
  };

  const updateDays = useCallback((dateStr, mealType, updater) => {
    setMealPlan(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.date === dateStr
          ? { ...day, [mealType]: updater(day[mealType]) }
          : day
      )
    }));
  }, []);

  const openSlotDialog = (dateStr, mealType) => {
    setSelectedSlot({ dateStr, mealType });
    setDialogOpen(true);
  };

  const handleConfirmSlot = (slotData) => {
    if (!selectedSlot || !mealPlan) return;
    updateDays(selectedSlot.dateStr, selectedSlot.mealType, () => slotData);
  };

  const clearSlot = (dateStr, mealType) => {
    updateDays(dateStr, mealType, () => null);
  };

  const updateMainPortions = (dateStr, mealType, val) => {
    updateDays(dateStr, mealType, prev =>
      prev ? { ...prev, portions: Math.max(1, parseInt(val) || 1) } : prev
    );
  };

  const updateSidePortions = (dateStr, mealType, recipe_id, val) => {
    updateDays(dateStr, mealType, prev =>
      prev ? {
        ...prev,
        side_dishes: (prev.side_dishes || []).map(sd =>
          sd.recipe_id === recipe_id
            ? { ...sd, portions: Math.max(1, parseInt(val) || 1) }
            : sd
        )
      } : prev
    );
  };

  const removeSideDish = (dateStr, mealType, recipe_id) => {
    updateDays(dateStr, mealType, prev =>
      prev ? {
        ...prev,
        side_dishes: (prev.side_dishes || []).filter(sd => sd.recipe_id !== recipe_id)
      } : prev
    );
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

  const mealTypes = [
    { key: "breakfast", label: "Frühstück", icon: Coffee },
    { key: "lunch", label: "Mittagessen", icon: UtensilsCrossed },
    { key: "dinner", label: "Abendessen", icon: Moon }
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
            <Button variant="ghost" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))} data-testid="prev-week-button">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                {format(currentWeekStart, "d. MMMM", { locale: de })} – {format(addDays(currentWeekStart, 6), "d. MMMM yyyy", { locale: de })}
              </h2>
              <Button
                variant="link"
                onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-emerald-600 text-sm p-0 h-auto"
              >
                Aktuelle Woche
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))} data-testid="next-week-button">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 gap-2 mb-2">
              <div />
              {days.map(({ date, dateStr }) => {
                const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={dateStr}
                    className={`text-center p-3 rounded-xl ${
                      isToday ? "bg-emerald-100" : "bg-[var(--bg-subtle)]"
                    }`}
                  >
                    <p className={`text-sm ${
                      isToday ? "text-emerald-700 font-medium" : "text-[var(--text-muted)]"
                    }`}>
                      {format(date, "EEE", { locale: de })}
                    </p>
                    <p className={`font-heading text-lg font-semibold ${
                      isToday ? "text-emerald-700" : "text-[var(--text-primary)]"
                    }`}>
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
                    <SlotCell
                      key={`${dateStr}-${key}`}
                      meal={meal}
                      dateStr={dateStr}
                      mealKey={key}
                      onOpen={() => openSlotDialog(dateStr, key)}
                      onClear={() => clearSlot(dateStr, key)}
                      onUpdatePortions={val => updateMainPortions(dateStr, key, val)}
                      onUpdateSidePortions={(rid, val) => updateSidePortions(dateStr, key, rid, val)}
                      onRemoveSide={rid => removeSideDish(dateStr, key, rid)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Slot Configuration Dialog */}
        <SlotConfigDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setSelectedSlot(null); }}
          onConfirm={handleConfirmSlot}
          initialSlot={selectedSlot ? getMealForSlot(selectedSlot.dateStr, selectedSlot.mealType) : null}
          recipes={recipes}
        />
      </div>
    </Layout>
  );
};

export default MealPlanner;
