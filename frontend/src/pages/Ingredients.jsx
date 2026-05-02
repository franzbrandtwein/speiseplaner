import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Plus, Pencil, Trash2, Search, X, ChevronDown, ChevronUp,
  ShoppingBag, Globe, UtensilsCrossed, HelpCircle, Package,
} from "lucide-react";

// ─── Kategorien ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  "Gemüse", "Obst", "Fleisch & Fisch", "Milchprodukte & Eier",
  "Getreide & Backwaren", "Hülsenfrüchte", "Nüsse & Samen",
  "Öle & Fette", "Gewürze & Kräuter", "Süßungsmittel",
  "Fertigprodukte", "Getränke", "Sonstiges",
];

const SOURCE_TYPE_ICON = {
  supermarket: ShoppingBag,
  restaurant: UtensilsCrossed,
  online: Globe,
  other: HelpCircle,
};

const NUTRITION_FIELDS = [
  { key: "calories",      label: "Kalorien",        unit: "kcal", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "protein",       label: "Protein",          unit: "g",    color: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "fat",           label: "Fett",             unit: "g",    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { key: "saturated_fat", label: "gesätt. Fett",     unit: "g",    color: "bg-yellow-50 border-yellow-200 text-yellow-600" },
  { key: "carbs",         label: "Kohlenhydrate",    unit: "g",    color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { key: "sugar",         label: "davon Zucker",     unit: "g",    color: "bg-emerald-50 border-emerald-200 text-emerald-600" },
  { key: "fiber",         label: "Ballaststoffe",    unit: "g",    color: "bg-green-50 border-green-200 text-green-700" },
  { key: "salt",          label: "Salz",             unit: "g",    color: "bg-gray-50 border-gray-200 text-gray-600" },
];

const EMPTY_NUTRITION = Object.fromEntries(NUTRITION_FIELDS.map(f => [f.key, ""]));
const EMPTY_FORM = { name: "", category: "Sonstiges", nutrition_per_100g: EMPTY_NUTRITION, pack_sizes: [], source_ids: [] };

// ─── Nährwert-Kacheln (Anzeige) ───────────────────────────────────────────────
export function NutritionBadges({ nutrition, className = "" }) {
  if (!nutrition) return null;
  const shown = NUTRITION_FIELDS.filter(f => nutrition[f.key] != null);
  if (shown.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map(f => (
        <span key={f.key} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${f.color}`}>
          {f.label}: {nutrition[f.key]}{f.unit}
        </span>
      ))}
    </div>
  );
}

// ─── Pack Sizes Editor ────────────────────────────────────────────────────────
const PackSizeEditor = ({ packs, onChange }) => {
  const add = () => onChange([...packs, { amount: "", unit: "l", description: "" }]);
  const remove = (i) => onChange(packs.filter((_, idx) => idx !== i));
  const update = (i, k, v) => onChange(packs.map((p, idx) => idx === i ? { ...p, [k]: v } : p));

  return (
    <div className="space-y-2">
      {packs.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            placeholder="1.5"
            value={p.amount}
            onChange={e => update(i, "amount", e.target.value)}
            className="w-24"
            type="number"
            step="0.01"
          />
          <span className="text-sm font-medium text-gray-600 w-6">l</span>
          <Input
            placeholder="Flasche, Kanister …"
            value={p.description}
            onChange={e => update(i, "description", e.target.value)}
            className="flex-1"
          />
          <button onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> Packmaß hinzufügen
      </button>
    </div>
  );
};

// ─── Source Multi-Select ──────────────────────────────────────────────────────
const SourceSelect = ({ selected, onChange, sources }) => {
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
      {sources.length === 0 && (
        <p className="text-xs text-gray-400">Noch keine Bezugsquellen vorhanden. Zuerst unter „Bezugsquellen" anlegen.</p>
      )}
      {sources.map(s => {
        const Icon = SOURCE_TYPE_ICON[s.type] || HelpCircle;
        const active = selected.includes(s.source_id);
        return (
          <button
            key={s.source_id}
            onClick={() => toggle(s.source_id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${
              active
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <Icon className="w-3 h-3" />
            {s.name}
          </button>
        );
      })}
    </div>
  );
};

// ─── Ingredient Dialog ────────────────────────────────────────────────────────
const IngredientDialog = ({ open, onClose, onSave, initial, sources }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const n = initial.nutrition_per_100g || {};
      setForm({
        name: initial.name,
        category: initial.category || "Sonstiges",
        nutrition_per_100g: Object.fromEntries(NUTRITION_FIELDS.map(f => [f.key, n[f.key] ?? ""])),
        pack_sizes: initial.pack_sizes || [],
        source_ids: initial.source_ids || [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initial, open]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setNutrition = (k, v) => setForm(f => ({ ...f, nutrition_per_100g: { ...f.nutrition_per_100g, [k]: v } }));

  const handleSave = () => {
    const nutrition = {};
    let hasNutrition = false;
    NUTRITION_FIELDS.forEach(f => {
      const v = form.nutrition_per_100g[f.key];
      if (v !== "" && v !== null && v !== undefined) {
        nutrition[f.key] = parseFloat(v);
        hasNutrition = true;
      } else {
        nutrition[f.key] = null;
      }
    });

    const packs = form.pack_sizes
      .filter(p => p.amount)
      .map(p => ({ amount: parseFloat(p.amount), unit: "l", description: p.description || "" }));

    onSave({
      name: form.name.trim(),
      category: form.category,
      nutrition_per_100g: hasNutrition ? nutrition : null,
      pack_sizes: packs,
      source_ids: form.source_ids,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial ? "Zutat bearbeiten" : "Neue Zutat"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Name + Kategorie */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
              <Input
                placeholder="z. B. Weizenmehl Type 550"
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                autoFocus
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Kategorie</label>
              <select
                value={form.category}
                onChange={e => setField("category", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Nährwerte */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Nährwerte pro 100 g / 100 ml</p>
            <div className="grid grid-cols-2 gap-2">
              {NUTRITION_FIELDS.map(f => (
                <div key={f.key} className={`rounded-lg border p-2 ${f.color}`}>
                  <label className="text-xs font-medium block mb-1">{f.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.nutrition_per_100g[f.key]}
                      onChange={e => setNutrition(f.key, e.target.value)}
                      placeholder="–"
                      className="w-full bg-white/70 border-0 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-current"
                    />
                    <span className="text-xs opacity-70 flex-shrink-0">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Packmaße */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Packmaße</p>
            <PackSizeEditor packs={form.pack_sizes} onChange={v => setField("pack_sizes", v)} />
          </div>

          {/* Bezugsquellen */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Bezugsquellen</p>
            <SourceSelect
              selected={form.source_ids}
              onChange={v => setField("source_ids", v)}
              sources={sources}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim()}
              className="flex-1 btn-primary"
            >
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Ingredient Card ──────────────────────────────────────────────────────────
const IngredientCard = ({ item, sources, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const n = item.nutrition_per_100g;
  const hasNutrition = n && Object.values(n).some(v => v != null);
  const itemSources = sources.filter(s => (item.source_ids || []).includes(s.source_id));

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--text-primary)]">{item.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{item.category}</span>
          </div>
          {hasNutrition && (
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              {n.calories != null && <span className="text-orange-600 font-medium">{n.calories} kcal</span>}
              {n.protein != null && <span>{n.protein}g Protein</span>}
              {n.carbs != null && <span>{n.carbs}g KH</span>}
              {n.fat != null && <span>{n.fat}g Fett</span>}
            </div>
          )}
          {itemSources.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {itemSources.map(s => {
                const Icon = SOURCE_TYPE_ICON[s.type] || HelpCircle;
                return (
                  <span key={s.source_id} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                    <Icon className="w-3 h-3" />{s.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(hasNutrition || item.pack_sizes?.length > 0) && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              title="Details"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => onEdit(item)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(item)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {hasNutrition && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Nährwerte pro 100 g</p>
              <div className="grid grid-cols-4 gap-1.5">
                {NUTRITION_FIELDS.map(f => n[f.key] != null ? (
                  <div key={f.key} className={`rounded-lg border p-2 text-center ${f.color}`}>
                    <div className="text-sm font-bold">{n[f.key]}</div>
                    <div className="text-[10px] opacity-70">{f.unit}</div>
                    <div className="text-[10px] mt-0.5 leading-tight">{f.label}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
          {item.pack_sizes?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Packmaße</p>
              <div className="flex gap-2 flex-wrap">
                {item.pack_sizes.map((p, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
                    {p.amount} {p.unit}{p.description ? ` – ${p.description}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Ingredients() {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const load = useCallback(async () => {
    try {
      const [itemsRes, sourcesRes] = await Promise.all([
        axios.get(`${API}/ingredients`, { withCredentials: true }),
        axios.get(`${API}/sources`, { withCredentials: true }),
      ]);
      setItems(itemsRes.data);
      setSources(sourcesRes.data);
    } catch {
      toast.error("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editItem) {
        const { data } = await axios.put(`${API}/ingredients/${editItem.ingredient_id}`, form, { withCredentials: true });
        setItems(prev => prev.map(i => i.ingredient_id === editItem.ingredient_id ? data : i));
        toast.success("Zutat aktualisiert");
      } else {
        const { data } = await axios.post(`${API}/ingredients`, form, { withCredentials: true });
        setItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Zutat erstellt");
      }
      setDialogOpen(false);
      setEditItem(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fehler beim Speichern");
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`„${item.name}" wirklich löschen?`)) return;
    try {
      await axios.delete(`${API}/ingredients/${item.ingredient_id}`, { withCredentials: true });
      setItems(prev => prev.filter(i => i.ingredient_id !== item.ingredient_id));
      toast.success("Zutat gelöscht");
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  const openCreate = () => { setEditItem(null); setDialogOpen(true); };
  const openEdit = (item) => { setEditItem(item); setDialogOpen(true); };

  const filtered = items.filter(i => {
    const matchCat = filterCat === "all" || i.category === filterCat;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const usedCats = [...new Set(items.map(i => i.category))].sort();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">Zutaten</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Nährwerte, Packmaße und Bezugsquellen verwalten</p>
        </div>
        <Button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Neue Zutat
        </Button>
      </div>

      {/* Suche + Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Zutat suchen …"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {usedCats.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCat === "all" ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"}`}
            >
              Alle ({items.length})
            </button>
            {usedCats.map(c => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCat === c ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"}`}
              >
                {c} ({items.filter(i => i.category === c).length})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Lädt …</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-[var(--text-muted)] border-dashed">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "Keine Zutaten gefunden" : "Noch keine Zutaten angelegt"}</p>
          {!search && (
            <>
              <p className="text-sm mt-1">Lege Zutaten mit Nährwerten an, damit Rezepte automatisch berechnet werden.</p>
              <Button onClick={openCreate} className="btn-primary mt-4">
                <Plus className="w-4 h-4" /> Erste Zutat anlegen
              </Button>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <IngredientCard
              key={item.ingredient_id}
              item={item}
              sources={sources}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <IngredientDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditItem(null); }}
        onSave={handleSave}
        initial={editItem}
        sources={sources}
      />
    </div>
  );
}
