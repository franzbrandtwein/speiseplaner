import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronLeft, ChevronRight, Plus, X, ShoppingCart,
  Coffee, UtensilsCrossed, Moon, ChefHat, ArrowLeft,
  Search, Minus, GripVertical, Users, Copy, BookTemplate, Bookmark, CookingPot, Store,
  ChevronDown, ChevronUp, CheckCircle2, Loader2
} from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";

// ─── Slot Configuration Dialog ───────────────────────────────────────────────
const SlotConfigDialog = ({ open, onClose, onConfirm, initialSlot, recipes, groupMembers = [] }) => {
  const [phase, setPhase] = useState("pick"); // "pick" | "configure" | "external"
  const [mainRecipe, setMainRecipe] = useState(null);
  const [mainPortions, setMainPortions] = useState(2);
  const [sideDishes, setSideDishes] = useState([]);
  const [assignedTo, setAssignedTo] = useState([]);
  const [mainSearch, setMainSearch] = useState("");
  const [sideSearch, setSideSearch] = useState("");
  const [showSideDropdown, setShowSideDropdown] = useState(false);
  const [externalName, setExternalName] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialSlot?.is_external) {
      setExternalName(initialSlot.recipe_name || "");
      setPhase("external");
    } else if (initialSlot?.recipe_id) {
      const recipe = recipes.find(r => r.recipe_id === initialSlot.recipe_id);
      setMainRecipe(recipe || { recipe_id: initialSlot.recipe_id, name: initialSlot.recipe_name });
      setMainPortions(initialSlot.portions || 2);
      setSideDishes(initialSlot.side_dishes || []);
      setAssignedTo(initialSlot.assigned_to || []);
      setPhase("configure");
    } else {
      setMainRecipe(null);
      setMainPortions(2);
      setSideDishes([]);
      setAssignedTo([]);
      setExternalName("");
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
    if (phase === "external") {
      if (!externalName.trim()) return;
      onConfirm({
        recipe_id: null,
        recipe_name: externalName.trim(),
        portions: 0,
        side_dishes: [],
        assigned_to: assignedTo,
        is_external: true,
      });
      onClose();
      return;
    }
    if (!mainRecipe) return;
    onConfirm({
      recipe_id: mainRecipe.recipe_id,
      recipe_name: mainRecipe.name,
      portions: mainPortions,
      side_dishes: sideDishes,
      assigned_to: assignedTo,
      is_external: false,
    });
    onClose();
  };

  const filteredMain = recipes.filter(r =>
    r.name.toLowerCase().includes(mainSearch.toLowerCase())
  );

  // Group by category with Hauptgericht first
  const CATEGORY_ORDER = [
    "Hauptgericht", "Frühstück", "Vorspeise", "Suppe", "Salat",
    "Beilage", "Snack", "Dessert", "Getränk"
  ];
  const groupedMain = filteredMain.reduce((acc, r) => {
    const cat = r.category || "Sonstige";
    (acc[cat] = acc[cat] || []).push(r);
    return acc;
  }, {});
  const sortedCategories = Object.keys(groupedMain).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "de");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const allowedSideIds = new Set(mainRecipe?.side_dishes || []);

  const filteredSide = recipes.filter(r =>
    r.recipe_id !== mainRecipe?.recipe_id &&
    allowedSideIds.has(r.recipe_id) &&
    !sideDishes.find(s => s.recipe_id === r.recipe_id) &&
    (sideSearch === "" || r.name.toLowerCase().includes(sideSearch.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            {(phase === "configure" || phase === "external") && (
              <button
                onClick={() => setPhase("pick")}
                className="p-1 rounded-lg hover:bg-gray-100 mr-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {phase === "pick" ? "Rezept auswählen" : phase === "external" ? "Außer Haus" : "Mahlzeit konfigurieren"}
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
            <div className="flex-1 overflow-y-auto space-y-4">
              {filteredMain.length === 0 ? (
                <div className="text-center py-10">
                  <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">
                    {recipes.length === 0 ? "Noch keine Rezepte vorhanden" : "Keine Rezepte gefunden"}
                  </p>
                </div>
              ) : (
                sortedCategories.map(cat => (
                  <div key={cat} className="space-y-1.5" data-testid={`recipe-category-${cat}`}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1">
                      {cat}
                      <span className="ml-2 text-[var(--text-muted)] font-normal normal-case tracking-normal">
                        ({groupedMain[cat].length})
                      </span>
                    </h3>
                    {groupedMain[cat].map(recipe => (
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
                    ))}
                  </div>
                ))
              )}
            </div>
            {/* Außer Haus Button */}
            <button
              onClick={() => { setExternalName(""); setPhase("external"); }}
              className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors font-medium"
            >
              <Store className="w-4 h-4" />
              Außer Haus (Restaurant, Imbiss …)
            </button>
          </div>
        )}

        {/* ── Phase: Außer Haus ── */}
        {phase === "external" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">Kein Rezept – z.&nbsp;B. Restaurant oder Imbiss.</p>
            <Input
              placeholder="Beschreibung (z. B. Pizzeria, Döner …)"
              value={externalName}
              onChange={e => setExternalName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              autoFocus
            />
            <Button
              onClick={handleConfirm}
              disabled={!externalName.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Speichern
            </Button>
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

              {/* Assigned to members (optional) */}
              {groupMembers.length > 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Für wen?</h3>
                    <span className="text-xs text-[var(--text-muted)]">(optional)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groupMembers.map(name => {
                      const active = assignedTo.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setAssignedTo(prev =>
                            active ? prev.filter(n => n !== name) : [...prev, name]
                          )}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            active
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                              : "bg-white text-gray-600 border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50"
                          }`}
                          data-testid={`assign-member-${name}`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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

                {/* Add side dish search - only when main recipe has configured side dishes */}
                {allowedSideIds.size > 0 ? (
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
                        data-testid="side-dish-search-input"
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
                            data-testid={`side-dish-option-${r.recipe_id}`}
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
                          <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">
                            Alle Beilagen bereits hinzugefügt
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="text-xs text-[var(--text-muted)] italic px-3 py-2 bg-gray-50 rounded-lg"
                    data-testid="no-side-dishes-hint"
                  >
                    Keine Beilagen am Rezept konfiguriert. Bearbeite das Rezept, um Beilagen hinzuzufügen.
                  </div>
                )}
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

// ─── Slot Cell (Compact) ──────────────────────────────────────────────────────
// ─── Slot Cell (Compact) ──────────────────────────────────────────────────────
const SlotCell = ({ meals, totalPortions, onOpen, dateStr, mealKey, onDragStart, onDragOver, onDrop, onDragLeave, isDragOver, isMoveSource, isMoving, onMoveStart }) => {
  const isEmpty = !meals || meals.length === 0;
  const isAllExternal = !isEmpty && meals.every(m => m.is_external);
  const hasExternal = !isEmpty && meals.some(m => m.is_external);

  if (isEmpty) {
    return (
      <Card
        className={`p-2 min-h-[56px] flex flex-col transition-all cursor-pointer border-dashed bg-[var(--bg-subtle)] ${
          isDragOver || (isMoving && !isMoveSource)
            ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
            : "hover:border-emerald-200 border-gray-200"
        }`}
        onClick={onOpen}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        data-testid={`meal-slot-${dateStr}-${mealKey}`}
      >
        <div className="flex-1 flex items-center justify-center">
          {isMoving && !isMoveSource ? (
            <span className="text-xs text-emerald-500 font-medium">Hierher</span>
          ) : (
            <Plus className={`w-4 h-4 ${isDragOver ? "text-emerald-500" : "text-[var(--text-muted)]"}`} />
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`p-2 min-h-[56px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
        isMoveSource
          ? "border-emerald-500 ring-2 ring-emerald-300 bg-emerald-50"
          : isDragOver || (isMoving && !isMoveSource)
            ? "border-emerald-400 ring-2 ring-emerald-200"
            : "bg-white border-gray-100 hover:border-emerald-200"
      }`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onClick={onOpen}
      data-testid={`meal-slot-${dateStr}-${mealKey}`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onMoveStart(); }}
        className={`p-1 rounded flex-shrink-0 transition-colors ${
          isMoveSource
            ? "bg-emerald-200 text-emerald-700"
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing"
        }`}
        data-testid={`move-grip-${dateStr}-${mealKey}`}
        title={isMoveSource ? "Abbrechen" : "Verschieben"}
      >
        <GripVertical className="w-5 h-5" />
      </button>
      <span className={`text-sm font-bold flex-shrink-0 ${isAllExternal ? "text-amber-600" : "text-emerald-700"}`} data-testid={`portions-badge-${dateStr}-${mealKey}`}>
        {isAllExternal ? <Store className="w-4 h-4" /> : totalPortions}
      </span>
      {meals.length > 1 && (
        <span className="text-[10px] text-gray-400">{meals.length}x</span>
      )}
    </Card>
  );
};

// ─── Slot Detail Dialog (Overlay, Multi-Meal) ─────────────────────────────────
const SlotDetailDialog = ({ open, onClose, meals, dateStr, mealType, mealLabel, onAddMeal, onEditMeal, onRemoveMeal, onClearAll, onUpdatePortions, onUpdateSidePortions, onRemoveSide, onCook, recipes }) => {
  if (!meals || meals.length === 0) return null;

  const fallbackLabels = { breakfast: "Frühstück", lunch: "Mittagessen", dinner: "Abendessen" };
  const label = mealLabel || fallbackLabels[mealType] || mealType;
  const dateLabel = dateStr ? format(new Date(dateStr), "EEEE, d. MMMM", { locale: de }) : "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{label}</DialogTitle>
          <p className="text-sm text-[var(--text-muted)]">{dateLabel}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {meals.map((meal, index) => (
            <div key={`${meal.recipe_id || meal.recipe_name}-${index}`} className={`border rounded-xl p-3 ${meal.is_external ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center gap-3 mb-2">
                {meal.is_external ? (
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-amber-500" />
                  </div>
                ) : (() => {
                  const r = recipes?.find(r => r.recipe_id === meal.recipe_id);
                  return r?.image_url ? (
                    <img src={r.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <ChefHat className="w-5 h-5 text-emerald-400" />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  {meal.is_external ? (
                    <span className="font-semibold text-sm text-amber-800 truncate block">{meal.recipe_name}</span>
                  ) : (
                    <Link to={`/recipes/${meal.recipe_id}`} className="font-semibold text-sm text-[var(--text-primary)] hover:text-emerald-700 truncate block">
                      {meal.recipe_name}
                    </Link>
                  )}
                  {meal.assigned_to?.length > 0 && (
                    <p className={`text-xs ${meal.is_external ? "text-amber-600" : "text-emerald-600"}`}>{meal.assigned_to.join(", ")}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemoveMeal(index)}
                  className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 flex-shrink-0"
                  data-testid={`remove-meal-${index}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {!meal.is_external && (<>
              {/* Portions */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-[var(--text-muted)]">Portionen:</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdatePortions(index, Math.max(1, (meal.portions || 2) - 1))} className="w-6 h-6 rounded-md bg-white border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 text-xs">-</button>
                  <span className="w-8 text-center text-sm font-semibold">{meal.portions || 2}</span>
                  <button onClick={() => onUpdatePortions(index, (meal.portions || 2) + 1)} className="w-6 h-6 rounded-md bg-white border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 text-xs">+</button>
                </div>
                <button onClick={() => onEditMeal(index)} className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">Bearbeiten</button>
              </div>
              {/* Side dishes compact */}
              {meal.side_dishes?.length > 0 && (
                <div className="border-t border-emerald-200 pt-2 space-y-1">
                  {meal.side_dishes.map((sd, sdIdx) => (
                    <div key={`${sd.recipe_id}-${sdIdx}`} className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-700 flex-1 truncate">+ {sd.recipe_name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onUpdateSidePortions(index, sd.recipe_id, Math.max(1, (sd.portions || 2) - 1))} className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">-</button>
                        <span className="w-5 text-center font-medium">{sd.portions || 2}</span>
                        <button onClick={() => onUpdateSidePortions(index, sd.recipe_id, (sd.portions || 2) + 1)} className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">+</button>
                      </div>
                      <button onClick={() => onRemoveSide(index, sd.recipe_id)} className="p-0.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              </>)}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-3 border-t border-gray-100 flex-wrap">
          <Button onClick={onAddMeal} className="btn-primary flex-1" data-testid="detail-add-meal-btn">
            <Plus className="w-4 h-4" /> Gericht hinzufügen
          </Button>
          <Button
            variant="outline"
            onClick={onCook}
            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            title="Zutaten aus Speisekammer abziehen"
          >
            <CookingPot className="w-4 h-4" /> Gekocht
          </Button>
          <Button
            variant="outline"
            onClick={onClearAll}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            data-testid="detail-clear-all-btn"
          >
            <X className="w-4 h-4" /> Löschen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
// ─── Wochenlisten-Ansicht ─────────────────────────────────────────────────────
const MEAL_META = {
  breakfast: { label: "Frühstück", icon: Coffee, color: "text-amber-500 bg-amber-50" },
  lunch:     { label: "Mittagessen", icon: UtensilsCrossed, color: "text-emerald-600 bg-emerald-50" },
  dinner:    { label: "Abendessen", icon: Moon, color: "text-indigo-500 bg-indigo-50" },
};

const WeekListView = ({ days, mealPlan, recipes, onSlotClick, mealTypes }) => {
  const [open, setOpen] = useState(true);

  const mealMetaMap = Object.fromEntries(
    (mealTypes || []).map((mt, idx) => {
      const ICONS = [Coffee, UtensilsCrossed, Moon, UtensilsCrossed, Coffee];
      const COLORS = [
        "text-amber-500 bg-amber-50",
        "text-emerald-600 bg-emerald-50",
        "text-indigo-500 bg-indigo-50",
        "text-rose-500 bg-rose-50",
        "text-sky-500 bg-sky-50",
      ];
      return [mt.key, { label: mt.label, icon: ICONS[idx] || UtensilsCrossed, color: COLORS[idx] || "text-gray-500 bg-gray-50" }];
    })
  );

  const getDayMeals = (dateStr) => {
    const day = mealPlan?.days?.find(d => d.date === dateStr);
    if (!day) return [];
    return (mealTypes || []).flatMap(mt =>
      (day[mt.key] || []).map(m => ({ ...m, mealType: mt.key }))
    );
  };

  const hasMeals = days.some(({ dateStr }) => getDayMeals(dateStr).length > 0);

  if (!hasMeals) return null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3 transition-colors"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        Wochenübersicht (Liste)
      </button>
      {open && (
        <div className="space-y-3">
          {days.map(({ date, dateStr }) => {
            const meals = getDayMeals(dateStr);
            if (meals.length === 0) return null;
            const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
            return (
              <Card key={dateStr} className={`overflow-hidden ${isToday ? "ring-2 ring-emerald-300" : ""}`}>
                <div className={`px-4 py-2 flex items-center justify-between ${isToday ? "bg-emerald-50" : "bg-[var(--bg-subtle)]"}`}>
                  <span className={`font-semibold text-sm ${isToday ? "text-emerald-700" : "text-[var(--text-primary)]"}`}>
                    {format(date, "EEEE, d. MMMM", { locale: de })}
                    {isToday && <span className="ml-2 text-xs bg-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded-full">Heute</span>}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{meals.length} Gericht{meals.length !== 1 ? "e" : ""}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {meals.map((meal, i) => {
                    const meta = mealMetaMap[meal.mealType] || { label: meal.mealType, icon: UtensilsCrossed, color: "text-gray-500 bg-gray-50" };
                    const recipe = recipes?.find(r => r.recipe_id === meal.recipe_id);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        onClick={() => onSlotClick(dateStr, meal.mealType)}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                          <meta.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate block">
                            {meal.recipe_name || "Unbekannt"}
                          </span>
                          {meal.assigned_to?.length > 0 && (
                            <span className="text-xs text-[var(--text-muted)]">{meal.assigned_to.join(", ")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-[var(--text-muted)]">
                          {meal.is_external ? (
                            <span className="flex items-center gap-1 text-amber-600"><Store className="w-3.5 h-3.5" /> Außer Haus</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" /> {meal.portions || 2}
                            </span>
                          )}
                          {recipe?.image_url && (
                            <img src={recipe.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── MealPlanner ─────────────────────────────────────────────────────────────
const MealPlanner = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [mealPlan, setMealPlan] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved" | "error"
  const autoSaveTimer = useRef(null);
  const isInitialLoad = useRef(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [detailSlot, setDetailSlot] = useState(null); // For detail overlay
  const [dragSource, setDragSource] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [moveSource, setMoveSource] = useState(null); // Mobile tap-to-move
  const [moveSourcePlan, setMoveSourcePlan] = useState(null); // { weekStart, days } für Cross-Week-Move
  const [groupMembers, setGroupMembers] = useState([]); // For assigned_to
  const [templates, setTemplates] = useState([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false); // "save" | "apply" | false
  const [templateName, setTemplateName] = useState("");
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [dayNutrition, setDayNutrition] = useState({}); // { dateStr: { calories, protein, ... } }
  const [mealTypes, setMealTypes] = useState([
    { key: "breakfast", label: "Frühstück" },
    { key: "lunch", label: "Mittagessen" },
    { key: "dinner", label: "Abendessen" },
  ]);

  const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");

  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(currentWeekStart, i),
    dateStr: format(addDays(currentWeekStart, i), "yyyy-MM-dd")
  }));

  useEffect(() => {
    // Wenn beim Wochenwechsel eine Verschiebung aktiv ist, Quelldaten der alten Woche merken
    if (moveSource && mealPlan) {
      const srcWeekStart = format(startOfWeek(new Date(moveSource.dateStr), { weekStartsOn: 1 }), "yyyy-MM-dd");
      setMoveSourcePlan({ weekStart: srcWeekStart, days: mealPlan.days });
    }
    fetchData();
  }, [weekStartStr]);

  const fetchData = async () => {
    isInitialLoad.current = true;
    setLoading(true);
    try {
      const [planRes, recipesRes, groupRes] = await Promise.all([
        axios.get(`${API}/mealplans?week_start=${weekStartStr}`, { withCredentials: true }),
        axios.get(`${API}/recipes`, { withCredentials: true }),
        axios.get(`${API}/groups/my`, { withCredentials: true }).catch(() => ({ data: { members: [] } }))
      ]);
      setMealPlan(planRes.data);
      setRecipes(recipesRes.data);
      setGroupMembers((groupRes.data.members || []).map(m => m.name));
      if (groupRes.data.group?.meal_types?.length) {
        setMealTypes(groupRes.data.group.meal_types);
      }
      fetchWeekNutrition(planRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  };

  // Auto-Save: bei jeder Änderung an mealPlan nach 800ms speichern
  useEffect(() => {
    if (isInitialLoad.current || !mealPlan) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      setSaving(true);
      try {
        await axios.post(`${API}/mealplans`, {
          week_start: weekStartStr,
          days: mealPlan.days
        }, { withCredentials: true });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } catch {
        setSaveStatus("error");
        toast.error("Automatisches Speichern fehlgeschlagen");
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [mealPlan]);

  const fetchWeekNutrition = async (plan) => {
    if (!plan?.days) return;
    const recipeIds = new Set();
    plan.days.forEach(day => {
      mealTypes.forEach(mt => {
        (day[mt.key] || []).forEach(m => { if (m.recipe_id) recipeIds.add(m.recipe_id); });
      });
    });
    if (recipeIds.size === 0) return;

    // Nährwerte pro Rezept laden (parallel, Fehler ignorieren)
    const results = await Promise.all(
      [...recipeIds].map(rid =>
        axios.get(`${API}/recipes/${rid}/nutrition`, { withCredentials: true })
          .then(r => [rid, r.data])
          .catch(() => null)
      )
    );
    const nutritionByRecipe = Object.fromEntries(results.filter(Boolean));

    // Pro Tag summieren
    const byDay = {};
    plan.days.forEach(day => {
      const total = { calories: null, protein: null, fat: null, carbs: null };
      mealTypes.forEach(mt => {
        (day[mt.key] || []).forEach(m => {
          if (!m.recipe_id || m.is_external) return;
          const n = nutritionByRecipe[m.recipe_id];
          if (!n?.per_portion) return;
          const factor = (m.portions || 2) / (n.portions || 1);
          ["calories", "protein", "fat", "carbs"].forEach(k => {
            if (n.total?.[k] != null) {
              total[k] = (total[k] ?? 0) + n.total[k] * factor;
            }
          });
        });
      });
      if (total.calories != null) {
        byDay[day.date] = { calories: Math.round(total.calories), protein: total.protein != null ? Math.round(total.protein) : null, fat: total.fat != null ? Math.round(total.fat) : null, carbs: total.carbs != null ? Math.round(total.carbs) : null };
      }
    });
    setDayNutrition(byDay);
  };

  const getMealsForSlot = (dateStr, mealType) => {
    const day = mealPlan?.days?.find(d => d.date === dateStr);
    const slot = day?.[mealType];
    // Always return array
    if (!slot) return [];
    if (Array.isArray(slot)) return slot;
    // Legacy single-object compat
    return slot.recipe_id ? [slot] : [];
  };

  const getTotalPortions = (dateStr, mealType) => {
    return getMealsForSlot(dateStr, mealType).reduce((sum, m) => sum + (m.portions || 2), 0);
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
    setSelectedSlot({ dateStr, mealType, editIndex: null });
    setDialogOpen(true);
  };

  const handleConfirmSlot = (slotData) => {
    if (!selectedSlot || !mealPlan) return;
    const { dateStr, mealType, editIndex } = selectedSlot;
    updateDays(dateStr, mealType, prev => {
      const meals = Array.isArray(prev) ? [...prev] : [];
      if (editIndex !== null && editIndex < meals.length) {
        meals[editIndex] = slotData;
      } else {
        meals.push(slotData);
      }
      return meals;
    });
  };

  const clearSlot = (dateStr, mealType) => {
    updateDays(dateStr, mealType, () => []);
  };

  const removeMealFromSlot = (dateStr, mealType, index) => {
    updateDays(dateStr, mealType, prev => {
      const meals = Array.isArray(prev) ? [...prev] : [];
      meals.splice(index, 1);
      return meals;
    });
  };

  const updateMealPortions = (dateStr, mealType, index, val) => {
    updateDays(dateStr, mealType, prev => {
      const meals = Array.isArray(prev) ? [...prev] : [];
      if (index < meals.length) {
        meals[index] = { ...meals[index], portions: Math.max(1, parseInt(val) || 1) };
      }
      return meals;
    });
  };

  const updateMealSidePortions = (dateStr, mealType, mealIndex, sideRecipeId, val) => {
    updateDays(dateStr, mealType, prev => {
      const meals = Array.isArray(prev) ? [...prev] : [];
      if (mealIndex < meals.length) {
        meals[mealIndex] = {
          ...meals[mealIndex],
          side_dishes: (meals[mealIndex].side_dishes || []).map(sd =>
            sd.recipe_id === sideRecipeId ? { ...sd, portions: Math.max(1, parseInt(val) || 1) } : sd
          )
        };
      }
      return meals;
    });
  };

  const removeMealSideDish = (dateStr, mealType, mealIndex, sideRecipeId) => {
    updateDays(dateStr, mealType, prev => {
      const meals = Array.isArray(prev) ? [...prev] : [];
      if (mealIndex < meals.length) {
        meals[mealIndex] = {
          ...meals[mealIndex],
          side_dishes: (meals[mealIndex].side_dishes || []).filter(sd => sd.recipe_id !== sideRecipeId)
        };
      }
      return meals;
    });
  };

  // ── Shared move/swap logic ──
  const performMoveOrSwap = async (srcDate, srcMeal, targetDate, targetMeal) => {
    if (srcDate === targetDate && srcMeal === targetMeal) return;

    const srcWeekStart = format(startOfWeek(new Date(srcDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const isCrossWeek = srcWeekStart !== weekStartStr;

    if (isCrossWeek) {
      // Cross-Week: Quelldaten aus moveSourcePlan, Zieldaten aus aktuellem mealPlan
      const sourcePlanDays = moveSourcePlan?.days;
      if (!sourcePlanDays) {
        toast.error("Quelldaten nicht mehr verfügbar – bitte erneut versuchen");
        setMoveSourcePlan(null);
        return;
      }
      const srcSlot = (() => {
        const day = sourcePlanDays.find(d => d.date === srcDate);
        const slot = day?.[srcMeal];
        if (!slot) return [];
        if (Array.isArray(slot)) return slot;
        return slot.recipe_id ? [slot] : [];
      })();
      const targetSlot = getMealsForSlot(targetDate, targetMeal);

      // Quellwoche: Slot leeren
      const newSourceDays = sourcePlanDays.map(d =>
        d.date === srcDate ? { ...d, [srcMeal]: targetSlot } : d
      );
      // Zielwoche: neue Days berechnen
      const newTargetDays = mealPlan?.days?.map(d =>
        d.date === targetDate ? { ...d, [targetMeal]: srcSlot } : d
      ) ?? [];

      // Lokalen State aktualisieren
      setMealPlan(prev => ({
        ...prev,
        days: newTargetDays
      }));

      // Beide Wochen speichern
      setSaving(true);
      try {
        await Promise.all([
          axios.post(`${API}/mealplans`, { week_start: srcWeekStart, days: newSourceDays }, { withCredentials: true }),
          axios.post(`${API}/mealplans`, { week_start: weekStartStr, days: newTargetDays }, { withCredentials: true }),
        ]);
        toast.success(targetSlot.length > 0 ? "Gerichte getauscht (Wochen)" : "Gericht in andere Woche verschoben");
      } catch {
        toast.error("Fehler beim Speichern des Wochenwechsels");
      } finally {
        setSaving(false);
      }
      setMoveSourcePlan(null);
      return;
    }

    // Same-Week-Move (bisherige Logik)
    const srcSlot = getMealsForSlot(srcDate, srcMeal);
    const targetSlot = getMealsForSlot(targetDate, targetMeal);
    setMealPlan(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.date === srcDate && srcDate === targetDate) {
          return { ...day, [srcMeal]: targetSlot, [targetMeal]: srcSlot };
        }
        if (day.date === srcDate) {
          return { ...day, [srcMeal]: targetSlot };
        }
        if (day.date === targetDate) {
          return { ...day, [targetMeal]: srcSlot };
        }
        return day;
      })
    }));
    toast.success(targetSlot.length > 0 ? "Gerichte getauscht" : "Gerichte verschoben");
  };

  // ── Desktop Drag & Drop ──
  const handleDragStart = (e, dateStr, mealType) => {
    setDragSource({ dateStr, mealType });
    setMoveSource(null); // cancel any mobile move
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${dateStr}|${mealType}`);
    if (e.target) e.target.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = "1";
    setDragSource(null);
    setDragOverTarget(null);
  };

  const handleDragOver = (e, dateStr, mealType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const key = `${dateStr}-${mealType}`;
    if (dragOverTarget !== key) setDragOverTarget(key);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = async (e, targetDateStr, targetMealType) => {
    e.preventDefault();
    setDragOverTarget(null);
    if (!dragSource || !mealPlan) return;
    const { dateStr: srcDate, mealType: srcMeal } = dragSource;
    setDragSource(null);
    await performMoveOrSwap(srcDate, srcMeal, targetDateStr, targetMealType);
  };

  // ── Mobile Tap-to-Move ──
  const handleMoveStart = (dateStr, mealType) => {
    if (moveSource && moveSource.dateStr === dateStr && moveSource.mealType === mealType) {
      setMoveSource(null); // tap same slot = cancel
      setMoveSourcePlan(null);
    } else {
      setMoveSource({ dateStr, mealType });
      setMoveSourcePlan(null); // Neues Move – alten Snapshot verwerfen
    }
  };

  const handleSlotClick = async (dateStr, mealType) => {
    if (moveSource) {
      if (moveSource.dateStr === dateStr && moveSource.mealType === mealType) {
        setMoveSource(null);
        setMoveSourcePlan(null); // cancel
      } else {
        await performMoveOrSwap(moveSource.dateStr, moveSource.mealType, dateStr, mealType);
        setMoveSource(null);
      }
    } else {
      const meals = getMealsForSlot(dateStr, mealType);
      if (meals.length > 0) {
        // Open detail overlay for filled slots
        setDetailSlot({ dateStr, mealType });
      } else {
        // Open recipe picker for empty slots
        openSlotDialog(dateStr, mealType);
      }
    }
  };

  const saveMealPlan = async () => {
    if (!mealPlan) return;
    setSaving(true);
    setSaveStatus("saving");
    try {
      await axios.post(`${API}/mealplans`, {
        week_start: weekStartStr,
        days: mealPlan.days
      }, { withCredentials: true });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      console.error("Error saving meal plan:", error);
      toast.error("Fehler beim Speichern");
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  // Template functions
  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/mealplan-templates`, { withCredentials: true });
      setTemplates(res.data);
    } catch (e) { console.error(e); }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await axios.post(`${API}/mealplan-templates`, { name: templateName.trim(), week_start: weekStartStr }, { withCredentials: true });
      toast.success("Vorlage gespeichert");
      setShowTemplateDialog(false);
      setTemplateName("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Speichern der Vorlage");
    }
  };

  const applyTemplate = async (templateId) => {
    try {
      await axios.post(`${API}/mealplan-templates/${templateId}/apply?week_start=${weekStartStr}`, {}, { withCredentials: true });
      toast.success("Vorlage angewendet");
      setShowTemplateDialog(false);
      fetchData();
    } catch (e) {
      toast.error("Fehler beim Anwenden der Vorlage");
    }
  };

  const deleteTemplate = async (templateId) => {
    try {
      await axios.delete(`${API}/mealplan-templates/${templateId}`, { withCredentials: true });
      setTemplates(prev => prev.filter(t => t.template_id !== templateId));
      toast.success("Vorlage gelöscht");
    } catch (e) { toast.error("Fehler"); }
  };

  const copyWeek = async () => {
    try {
      const nextWeek = format(addWeeks(currentWeekStart, 1), "yyyy-MM-dd");
      await axios.post(`${API}/mealplans/copy?source_week=${weekStartStr}&target_week=${nextWeek}`, {}, { withCredentials: true });
      toast.success("Wochenplan in nächste Woche kopiert");
      setShowCopyDialog(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Kopieren");
    }
  };

  const mealTypesMeta = mealTypes.map((mt, idx) => {
    const ICONS = [Coffee, UtensilsCrossed, Moon, UtensilsCrossed, Coffee];
    const COLORS = [
      "text-amber-500 bg-amber-50",
      "text-emerald-600 bg-emerald-50",
      "text-indigo-500 bg-indigo-50",
      "text-rose-500 bg-rose-50",
      "text-sky-500 bg-sky-50",
    ];
    return { ...mt, icon: ICONS[idx] || UtensilsCrossed, color: COLORS[idx] || "text-gray-500 bg-gray-50" };
  });

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
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => { setShowTemplateDialog("apply"); fetchTemplates(); }} className="btn-secondary" data-testid="apply-template-btn">
              <Bookmark className="w-4 h-4" /> Vorlagen
            </Button>
            <Button variant="outline" onClick={() => setShowTemplateDialog("save")} className="btn-secondary" data-testid="save-template-btn">
              <Bookmark className="w-4 h-4" /> Als Vorlage
            </Button>
            <Button variant="outline" onClick={() => setShowCopyDialog(true)} className="btn-secondary" data-testid="copy-week-btn">
              <Copy className="w-4 h-4" /> Kopieren
            </Button>
            <Link to="/shopping-list">
              <Button variant="outline" className="btn-secondary">
                <ShoppingCart className="w-4 h-4" /> Einkaufsliste
              </Button>
            </Link>
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-sm text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Speichert…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Gespeichert
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-red-500">Fehler beim Speichern</span>
            )}
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

        {/* Move Mode Banner */}
        {moveSource && (
          <Card className="p-3 mb-4 bg-emerald-50 border-emerald-200 flex items-center justify-between animate-fade-in" data-testid="move-mode-banner">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {getMealsForSlot(moveSource.dateStr, moveSource.mealType).map(m => m.recipe_name).join(", ")} verschieben — Ziel-Slot antippen
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMoveSource(null)}
              className="text-emerald-600 hover:bg-emerald-100 h-7"
              data-testid="cancel-move-btn"
            >
              <X className="w-4 h-4" /> Abbrechen
            </Button>
          </Card>
        )}

        {/* Calendar Grid */}
        <div className="overflow-x-auto" onDragEnd={handleDragEnd}>
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
                    {dayNutrition[dateStr] && (
                      <p className="text-[10px] text-orange-500 font-medium mt-0.5">
                        {dayNutrition[dateStr].calories} kcal
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Meal Rows */}
            {mealTypesMeta.map(({ key, label, icon: Icon }) => (
              <div key={key} className="grid grid-cols-8 gap-2 mb-2">
                <div className="flex items-center gap-2 p-3 text-[var(--text-secondary)]">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{label}</span>
                </div>
                {days.map(({ dateStr }) => {
                  const meals = getMealsForSlot(dateStr, key);
                  const totalPortions = getTotalPortions(dateStr, key);
                  const isMvSrc = moveSource?.dateStr === dateStr && moveSource?.mealType === key;
                  return (
                    <SlotCell
                      key={`${dateStr}-${key}`}
                      meals={meals}
                      totalPortions={totalPortions}
                      dateStr={dateStr}
                      mealKey={key}
                      onOpen={() => handleSlotClick(dateStr, key)}
                      isDragOver={dragOverTarget === `${dateStr}-${key}`}
                      isMoveSource={isMvSrc}
                      isMoving={!!moveSource}
                      onMoveStart={() => handleMoveStart(dateStr, key)}
                      onDragStart={e => handleDragStart(e, dateStr, key)}
                      onDragOver={e => handleDragOver(e, dateStr, key)}
                      onDrop={e => handleDrop(e, dateStr, key)}
                      onDragLeave={handleDragLeave}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Listenansicht ── */}
        <WeekListView
          days={days}
          mealPlan={mealPlan}
          recipes={recipes}
          onSlotClick={handleSlotClick}
          mealTypes={mealTypes}
        />
        {detailSlot && (
          <SlotDetailDialog
            open={!!detailSlot}
            onClose={() => setDetailSlot(null)}
            meals={detailSlot ? getMealsForSlot(detailSlot.dateStr, detailSlot.mealType) : []}
            dateStr={detailSlot?.dateStr}
            mealType={detailSlot?.mealType}
            mealLabel={mealTypes.find(mt => mt.key === detailSlot?.mealType)?.label}
            onAddMeal={() => {
              setSelectedSlot({ dateStr: detailSlot.dateStr, mealType: detailSlot.mealType, editIndex: null });
              setDialogOpen(true);
              setDetailSlot(null);
            }}
            onEditMeal={(index) => {
              setSelectedSlot({ dateStr: detailSlot.dateStr, mealType: detailSlot.mealType, editIndex: index });
              setDialogOpen(true);
              setDetailSlot(null);
            }}
            onRemoveMeal={(index) => {
              removeMealFromSlot(detailSlot.dateStr, detailSlot.mealType, index);
            }}
            onClearAll={() => {
              clearSlot(detailSlot.dateStr, detailSlot.mealType);
              setDetailSlot(null);
            }}
            onCook={async () => {
              const meals = getMealsForSlot(detailSlot.dateStr, detailSlot.mealType);
              const entries = [];
              meals.forEach(m => {
                if (m.recipe_id) entries.push({ recipe_id: m.recipe_id, portions: m.portions || 2 });
                (m.side_dishes || []).forEach(sd => {
                  if (sd.recipe_id) entries.push({ recipe_id: sd.recipe_id, portions: sd.portions || 2 });
                });
              });
              if (entries.length === 0) return;
              try {
                const res = await axios.post(`${API}/pantry/consume`, { meals: entries }, { withCredentials: true });
                const { consumed, not_available } = res.data;
                if (consumed.length > 0) {
                  toast.success(`${consumed.length} Zutaten aus Speisekammer abgezogen`);
                } else {
                  toast.info("Keine passenden Zutaten in der Speisekammer gefunden");
                }
                if (not_available.length > 0) {
                  toast.warning(`Nicht vorrätig: ${not_available.slice(0, 3).map(i => i.name).join(", ")}${not_available.length > 3 ? " …" : ""}`);
                }
              } catch {
                toast.error("Fehler beim Abziehen aus der Speisekammer");
              }
            }}
            onUpdatePortions={(index, val) => updateMealPortions(detailSlot.dateStr, detailSlot.mealType, index, val)}
            onUpdateSidePortions={(mealIdx, rid, val) => updateMealSidePortions(detailSlot.dateStr, detailSlot.mealType, mealIdx, rid, val)}
            onRemoveSide={(mealIdx, rid) => removeMealSideDish(detailSlot.dateStr, detailSlot.mealType, mealIdx, rid)}
            recipes={recipes}
          />
        )}

        {/* Slot Configuration Dialog */}
        <SlotConfigDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setSelectedSlot(null); }}
          onConfirm={handleConfirmSlot}
          initialSlot={selectedSlot?.editIndex !== null && selectedSlot?.editIndex !== undefined
            ? getMealsForSlot(selectedSlot.dateStr, selectedSlot.mealType)[selectedSlot.editIndex] || null
            : null}
          recipes={recipes}
          groupMembers={groupMembers}
        />

        {/* Template Save Dialog */}
        <Dialog open={showTemplateDialog === "save"} onOpenChange={() => setShowTemplateDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Als Vorlage speichern</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Name der Vorlage"
                data-testid="template-name-input"
              />
              <Button onClick={saveAsTemplate} disabled={!templateName.trim()} className="btn-primary w-full" data-testid="confirm-save-template">
                <Bookmark className="w-4 h-4" /> Vorlage speichern
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Template Apply Dialog */}
        <Dialog open={showTemplateDialog === "apply"} onOpenChange={() => setShowTemplateDialog(false)}>
          <DialogContent className="max-w-md max-h-[70vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Vorlage anwenden</DialogTitle>
              <p className="text-sm text-[var(--text-muted)]">Wende eine Vorlage auf die aktuelle Woche an</p>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-2">
              {templates.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-8">Noch keine Vorlagen gespeichert</p>
              ) : templates.map(t => (
                <div key={t.template_id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-medium text-sm text-[var(--text-primary)]">{t.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(t.created_at).toLocaleDateString("de-DE")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => applyTemplate(t.template_id)} className="btn-primary" data-testid={`apply-tmpl-${t.template_id}`}>
                      Anwenden
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t.template_id)} className="text-red-500 hover:bg-red-50">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Copy Week Dialog */}
        <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Wochenplan kopieren</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[var(--text-secondary)]">
              Den aktuellen Wochenplan in die <strong>nächste Woche</strong> ({format(addWeeks(currentWeekStart, 1), "d. MMMM", { locale: de })} – {format(addDays(addWeeks(currentWeekStart, 1), 6), "d. MMMM", { locale: de })}) kopieren?
            </p>
            <div className="flex gap-2 pt-2">
              <Button onClick={copyWeek} className="btn-primary flex-1" data-testid="confirm-copy-week">
                <Copy className="w-4 h-4" /> Kopieren
              </Button>
              <Button variant="outline" onClick={() => setShowCopyDialog(false)}>Abbrechen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default MealPlanner;
