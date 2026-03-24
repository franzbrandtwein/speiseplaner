import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Check, X, Package,
  Wine, Flame, SprayCan, CakeSlice, HelpCircle, ShoppingBasket
} from "lucide-react";

const CATEGORY_ICONS = {
  "Getränke": Wine,
  "Gewürze": Flame,
  "Haushalt": SprayCan,
  "Hygiene": SprayCan,
  "Backzutaten": CakeSlice,
  "Sonstiges": HelpCircle,
};

const CATEGORY_COLORS = {
  "Getränke": "bg-blue-50 text-blue-600 border-blue-200",
  "Gewürze": "bg-amber-50 text-amber-600 border-amber-200",
  "Haushalt": "bg-purple-50 text-purple-600 border-purple-200",
  "Hygiene": "bg-pink-50 text-pink-600 border-pink-200",
  "Backzutaten": "bg-orange-50 text-orange-600 border-orange-200",
  "Sonstiges": "bg-gray-50 text-gray-600 border-gray-200",
};

const UNITS = ["Stück", "Packung", "Flasche", "Liter", "ml", "kg", "g", "Dose", "Beutel", "Rolle", "Tube"];

const StapleItems = () => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", amount: "", unit: "Stück", category: "Sonstiges" });
  const [filterCat, setFilterCat] = useState("Alle");

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/staple-items`, { withCredentials: true });
      setItems(res.data.items || []);
      setCategories(res.data.categories || []);
    } catch {
      toast.error("Fehler beim Laden der Artikel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const resetForm = () => {
    setForm({ name: "", amount: "", unit: "Stück", category: "Sonstiges" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.amount) {
      toast.error("Name und Menge sind Pflichtfelder");
      return;
    }
    try {
      if (editingId) {
        await axios.put(`${API}/staple-items/${editingId}`, {
          name: form.name.trim(),
          amount: parseFloat(form.amount),
          unit: form.unit,
          category: form.category,
        }, { withCredentials: true });
        toast.success("Artikel aktualisiert");
      } else {
        await axios.post(`${API}/staple-items`, {
          name: form.name.trim(),
          amount: parseFloat(form.amount),
          unit: form.unit,
          category: form.category,
          active: true,
        }, { withCredentials: true });
        toast.success("Artikel hinzugefügt");
      }
      resetForm();
      fetchItems();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const startEdit = (item) => {
    setForm({ name: item.name, amount: String(item.amount), unit: item.unit, category: item.category });
    setEditingId(item.item_id);
    setShowForm(true);
  };

  const toggleActive = async (item) => {
    try {
      await axios.put(`${API}/staple-items/${item.item_id}`, { active: !item.active }, { withCredentials: true });
      fetchItems();
    } catch {
      toast.error("Fehler beim Ändern");
    }
  };

  const deleteItem = async (item_id) => {
    try {
      await axios.delete(`${API}/staple-items/${item_id}`, { withCredentials: true });
      toast.success("Artikel gelöscht");
      fetchItems();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const grouped = items.reduce((acc, item) => {
    const cat = item.category || "Sonstiges";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const filteredGroups = filterCat === "Alle" ? grouped : { [filterCat]: grouped[filterCat] || [] };
  const activeCats = ["Alle", ...Object.keys(grouped)];

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
      <div className="animate-fade-in max-w-2xl mx-auto" data-testid="staple-items-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Sonstige Artikel
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Wöchentlicher Bedarf an Getränken, Gewürzen, Haushaltswaren etc.
            </p>
          </div>
          <Button
            className="btn-primary"
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="add-staple-item-btn"
          >
            <Plus className="w-4 h-4" /> Artikel hinzufügen
          </Button>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <Card className="p-5 mb-6 bg-white border-gray-100" data-testid="staple-item-form">
            <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4">
              {editingId ? "Artikel bearbeiten" : "Neuer Artikel"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="sm:col-span-2">
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Name</label>
                <Input
                  placeholder="z.B. Mineralwasser, Küchentücher..."
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="staple-name-input"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Menge pro Woche</label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="z.B. 6"
                  value={form.amount}
                  onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                  data-testid="staple-amount-input"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Einheit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md bg-white text-[var(--text-primary)]"
                  data-testid="staple-unit-select"
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Kategorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md bg-white text-[var(--text-primary)]"
                  data-testid="staple-category-select"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm} data-testid="cancel-staple-btn">
                <X className="w-4 h-4" /> Abbrechen
              </Button>
              <Button className="btn-primary" onClick={handleSave} data-testid="save-staple-btn">
                <Check className="w-4 h-4" /> {editingId ? "Aktualisieren" : "Hinzufügen"}
              </Button>
            </div>
          </Card>
        )}

        {/* Category Filter */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {activeCats.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filterCat === cat
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
                }`}
                data-testid={`filter-cat-${cat}`}
              >
                {cat} {cat !== "Alle" && `(${grouped[cat]?.length || 0})`}
              </button>
            ))}
          </div>
        )}

        {/* Items by Category */}
        {items.length === 0 ? (
          <Card className="p-12 bg-white border-gray-100 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Keine Artikel vorhanden
            </h3>
            <p className="text-[var(--text-muted)] mb-6">
              Füge Artikel wie Getränke, Gewürze oder Haushaltswaren hinzu, die wöchentlich gebraucht werden.
            </p>
            <Button
              className="btn-primary"
              onClick={() => { resetForm(); setShowForm(true); }}
            >
              <Plus className="w-4 h-4" /> Ersten Artikel hinzufügen
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(filteredGroups).map(([cat, catItems]) => {
              if (!catItems || catItems.length === 0) return null;
              const Icon = CATEGORY_ICONS[cat] || ShoppingBasket;
              const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS["Sonstiges"];
              return (
                <div key={cat} data-testid={`category-group-${cat}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.split(" ").slice(0, 2).join(" ")}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)]">{cat}</h2>
                    <span className="text-xs text-[var(--text-muted)]">({catItems.length})</span>
                  </div>
                  <Card className="bg-white border-gray-100 divide-y divide-gray-50 overflow-hidden">
                    {catItems.map(item => (
                      <div
                        key={item.item_id}
                        className={`flex items-center gap-4 p-4 transition-all ${
                          !item.active ? "opacity-50" : ""
                        }`}
                        data-testid={`staple-item-${item.item_id}`}
                      >
                        <Switch
                          checked={item.active}
                          onCheckedChange={() => toggleActive(item)}
                          data-testid={`toggle-active-${item.item_id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium text-sm ${item.active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] line-through"}`}>
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono text-sm text-[var(--text-secondary)] whitespace-nowrap">
                          {item.amount} {item.unit} / Woche
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                            data-testid={`edit-staple-${item.item_id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteItem(item.item_id)}
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                            data-testid={`delete-staple-${item.item_id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {/* Info */}
        {items.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-6 text-center">
            Aktive Artikel werden automatisch zur wöchentlichen Einkaufsliste hinzugefügt.
          </p>
        )}
      </div>
    </Layout>
  );
};

export default StapleItems;
