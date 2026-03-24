import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { 
  ShoppingCart, ChevronLeft, ChevronRight, Calendar, 
  Check, Printer, Share2, Package 
} from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { de } from "date-fns/locale";

const ShoppingList = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [shoppingList, setShoppingList] = useState({ items: [], staple_items: [] });
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState({});

  const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");

  useEffect(() => {
    fetchShoppingList();
  }, [weekStartStr]);

  const fetchShoppingList = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/shopping-list?week_start=${weekStartStr}`, 
        { withCredentials: true }
      );
      setShoppingList(response.data);
      setCheckedItems({});
    } catch (error) {
      console.error("Error fetching shopping list:", error);
      toast.error("Einkaufsliste konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const toggleItem = (key) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allItems = [
    ...(shoppingList.items || []).map(i => ({ ...i, key: `recipe_${i.ingredient_name}` })),
    ...(shoppingList.staple_items || []).map(i => ({ ...i, key: `staple_${i.item_id}` })),
  ];
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const totalCount = allItems.length;

  const handlePrint = () => window.print();

  const handleShare = async () => {
    const lines = [];
    if (shoppingList.items?.length > 0) {
      lines.push("--- Rezept-Zutaten ---");
      shoppingList.items.forEach(item => {
        lines.push(`${checkedItems[`recipe_${item.ingredient_name}`] ? "\u2713" : "\u2610"} ${item.ingredient_name}: ${item.total_amount} ${item.unit}`);
      });
    }
    if (shoppingList.staple_items?.length > 0) {
      lines.push("");
      lines.push("--- Sonstige Artikel ---");
      shoppingList.staple_items.forEach(item => {
        lines.push(`${checkedItems[`staple_${item.item_id}`] ? "\u2713" : "\u2610"} ${item.ingredient_name}: ${item.total_amount} ${item.unit}`);
      });
    }
    const text = lines.join("\n");
    
    if (navigator.share) {
      try {
        await navigator.share({ title: "Einkaufsliste", text });
      } catch {}
    } else {
      navigator.clipboard.writeText(text);
      toast.success("In Zwischenablage kopiert");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const hasRecipeItems = shoppingList.items?.length > 0;
  const hasStapleItems = shoppingList.staple_items?.length > 0;
  const hasAnyItems = hasRecipeItems || hasStapleItems;

  return (
    <Layout>
      <div className="animate-fade-in max-w-2xl mx-auto" data-testid="shopping-list-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Einkaufsliste
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Automatisch generiert aus Speiseplan & sonstigen Artikeln
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} className="btn-secondary">
              <Printer className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={handleShare} className="btn-secondary">
              <Share2 className="w-4 h-4" />
            </Button>
            <Link to="/meal-planner">
              <Button variant="outline" className="btn-secondary">
                <Calendar className="w-4 h-4" /> Planer
              </Button>
            </Link>
          </div>
        </div>

        {/* Week Navigation */}
        <Card className="p-4 mb-6 bg-white border-gray-100">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={goToPreviousWeek} data-testid="prev-week-button">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)]">
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

        {/* Progress */}
        {totalCount > 0 && (
          <Card className="p-4 mb-6 bg-emerald-50 border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-emerald-700 font-medium">Fortschritt</span>
              <span className="text-emerald-700 font-mono">
                {checkedCount} / {totalCount}
              </span>
            </div>
            <div className="h-2 bg-emerald-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </Card>
        )}

        {!hasAnyItems ? (
          <Card className="p-12 bg-white border-gray-100 text-center">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Keine Einträge
            </h3>
            <p className="text-[var(--text-muted)] mb-6">
              Plane Mahlzeiten oder lege sonstige Artikel an, um eine Einkaufsliste zu generieren.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link to="/meal-planner">
                <Button className="btn-primary">
                  <Calendar className="w-4 h-4" /> Zum Speiseplan
                </Button>
              </Link>
              <Link to="/staple-items">
                <Button variant="outline" className="btn-secondary">
                  <Package className="w-4 h-4" /> Sonstige Artikel
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Recipe Ingredients */}
            {hasRecipeItems && (
              <Card className="bg-white border-gray-100 overflow-hidden" data-testid="recipe-ingredients-section">
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-heading font-semibold text-sm text-[var(--text-primary)]">
                      Rezept-Zutaten
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">
                      ({shoppingList.items.length})
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-gray-50">
                  {shoppingList.items.map((item, idx) => {
                    const key = `recipe_${item.ingredient_name}`;
                    const isChecked = checkedItems[key];
                    return (
                      <li 
                        key={idx}
                        className={`flex items-center gap-4 px-6 py-3 transition-all cursor-pointer ${
                          isChecked ? "bg-emerald-50" : "hover:bg-gray-50"
                        }`}
                        onClick={() => toggleItem(key)}
                        data-testid={`shopping-item-${idx}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleItem(key)}
                          className={isChecked ? "border-emerald-500 bg-emerald-500" : ""}
                        />
                        <span className={`flex-1 text-sm ${isChecked ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                          {item.ingredient_name}
                        </span>
                        <span className={`font-mono text-sm ${isChecked ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`}>
                          {item.total_amount} {item.unit}
                        </span>
                        {isChecked && <Check className="w-4 h-4 text-emerald-500" />}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {/* Staple Items */}
            {hasStapleItems && (
              <Card className="bg-white border-gray-100 overflow-hidden" data-testid="staple-items-section">
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-600" />
                    <h3 className="font-heading font-semibold text-sm text-[var(--text-primary)]">
                      Sonstige Artikel
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">
                      ({shoppingList.staple_items.length})
                    </span>
                  </div>
                  <Link to="/staple-items" className="text-xs text-emerald-600 hover:underline">
                    Verwalten
                  </Link>
                </div>
                <ul className="divide-y divide-gray-50">
                  {shoppingList.staple_items.map((item) => {
                    const key = `staple_${item.item_id}`;
                    const isChecked = checkedItems[key];
                    return (
                      <li 
                        key={item.item_id}
                        className={`flex items-center gap-4 px-6 py-3 transition-all cursor-pointer ${
                          isChecked ? "bg-emerald-50" : "hover:bg-gray-50"
                        }`}
                        onClick={() => toggleItem(key)}
                        data-testid={`staple-shopping-item-${item.item_id}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleItem(key)}
                          className={isChecked ? "border-emerald-500 bg-emerald-500" : ""}
                        />
                        <span className={`flex-1 text-sm ${isChecked ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                          {item.ingredient_name}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] px-2 py-0.5 bg-gray-100 rounded-full">
                          {item.category}
                        </span>
                        <span className={`font-mono text-sm ${isChecked ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`}>
                          {item.total_amount} {item.unit}
                        </span>
                        {isChecked && <Check className="w-4 h-4 text-emerald-500" />}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ShoppingList;
