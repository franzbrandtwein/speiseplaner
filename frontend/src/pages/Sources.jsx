import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  ShoppingBag, Globe, UtensilsCrossed, HelpCircle,
  Plus, Pencil, Trash2, ExternalLink,
} from "lucide-react";

const TYPE_OPTIONS = [
  { value: "supermarket", label: "Supermarkt", icon: ShoppingBag, color: "text-emerald-600 bg-emerald-50" },
  { value: "restaurant",  label: "Restaurant",  icon: UtensilsCrossed, color: "text-amber-600 bg-amber-50" },
  { value: "online",      label: "Online",      icon: Globe, color: "text-blue-600 bg-blue-50" },
  { value: "other",       label: "Sonstiges",   icon: HelpCircle, color: "text-gray-600 bg-gray-100" },
];

const TYPE_MAP = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t]));

const EMPTY_FORM = { name: "", type: "supermarket", url: "", notes: "" };

// ─── Source Form Dialog ───────────────────────────────────────────────────────
const SourceDialog = ({ open, onClose, onSave, initial }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    setForm(initial ? { name: initial.name, type: initial.type, url: initial.url || "", notes: initial.notes || "" } : EMPTY_FORM);
  }, [initial, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial ? "Bezugsquelle bearbeiten" : "Neue Bezugsquelle"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
            <Input
              placeholder="z. B. Rewe, Aldi, Pizzeria Bella Italia"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Typ</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  onClick={() => set("type", t.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    form.type === t.value
                      ? `border-current ${t.color}`
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Website (optional)</label>
            <Input
              placeholder="https://www.rewe.de"
              value={form.url}
              onChange={e => set("url", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Notiz (optional)</label>
            <Input
              placeholder="z. B. Di–Sa geöffnet, gute Bio-Auswahl"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button
              onClick={() => onSave(form)}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Sources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSource, setEditSource] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/sources`, { withCredentials: true });
      setSources(data);
    } catch {
      toast.error("Bezugsquellen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editSource) {
        const { data } = await axios.put(`${API}/api/sources/${editSource.source_id}`, form, { withCredentials: true });
        setSources(prev => prev.map(s => s.source_id === editSource.source_id ? data : s));
        toast.success("Bezugsquelle aktualisiert");
      } else {
        const { data } = await axios.post(`${API}/api/sources`, form, { withCredentials: true });
        setSources(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Bezugsquelle erstellt");
      }
      setDialogOpen(false);
      setEditSource(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fehler beim Speichern");
    }
  };

  const handleDelete = async (source) => {
    if (!window.confirm(`„${source.name}" wirklich löschen?`)) return;
    try {
      await axios.delete(`${API}/api/sources/${source.source_id}`, { withCredentials: true });
      setSources(prev => prev.filter(s => s.source_id !== source.source_id));
      toast.success("Bezugsquelle gelöscht");
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  const openCreate = () => { setEditSource(null); setDialogOpen(true); };
  const openEdit = (s) => { setEditSource(s); setDialogOpen(true); };

  const filtered = filterType === "all" ? sources : sources.filter(s => s.type === filterType);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">Bezugsquellen</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Supermärkte, Restaurants und Online-Shops verwalten</p>
        </div>
        <Button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Neue Bezugsquelle
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterType("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            filterType === "all" ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"
          }`}
        >
          Alle ({sources.length})
        </button>
        {TYPE_OPTIONS.map(t => {
          const count = sources.filter(s => s.type === t.value).length;
          if (count === 0) return null;
          return (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filterType === t.value ? `${t.color} border-2 border-current` : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Lädt …</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-[var(--text-muted)] border-dashed">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Noch keine Bezugsquellen</p>
          <p className="text-sm mt-1">Füge z. B. „Rewe" oder dein Lieblingsrestaurant hinzu.</p>
          <Button onClick={openCreate} className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Erste Bezugsquelle
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const meta = TYPE_MAP[s.type] || TYPE_MAP.other;
            return (
              <Card key={s.source_id} className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                  <meta.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{s.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                  </div>
                  {s.notes && <p className="text-sm text-[var(--text-muted)] truncate">{s.notes}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                      title="Website öffnen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(s)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SourceDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditSource(null); }}
        onSave={handleSave}
        initial={editSource}
      />
    </div>
  );
}
