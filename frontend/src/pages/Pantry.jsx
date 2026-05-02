import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import {
  Archive, Plus, Trash2, Edit2, Check, X, AlertTriangle, RefreshCw
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";

const CATEGORIES = ["Backzutaten", "Getränke", "Gemüse & Obst", "Gewürze", "Konserven", "Kühlware", "Milchprodukte", "Tiefkühl", "Sonstiges"];

const emptyForm = { name: "", amount: "", unit: "", category: "Sonstiges", expires_at: "" };

const ExpiryBadge = ({ expiresAt }) => {
  if (!expiresAt) return null;
  const days = differenceInDays(parseISO(expiresAt), new Date());
  if (days < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">abgelaufen</span>;
  if (days <= 3) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {days}d</span>;
  if (days <= 7) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">{days}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{format(parseISO(expiresAt), "d. MMM", { locale: de })}</span>;
};

const Pantry = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/pantry`, { withCredentials: true });
      setItems(res.data.items || []);
    } catch {
      toast.error("Speisekammer konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit = (item) => {
    setForm({
      name: item.name,
      amount: String(item.amount),
      unit: item.unit,
      category: item.category || "Sonstiges",
      expires_at: item.expires_at || "",
    });
    setEditId(item.item_id);
    setShowForm(true);
  };
  const cancelForm = () => { setShowForm(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.amount || !form.unit.trim()) {
      toast.error("Name, Menge und Einheit sind Pflichtfelder");
      return;
    }
    const payload = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      unit: form.unit.trim(),
      category: form.category,
      expires_at: form.expires_at || null,
    };
    setSaving(true);
    try {
      if (editId) {
        await axios.put(`${API}/pantry/${editId}`, payload, { withCredentials: true });
        toast.success("Artikel aktualisiert");
      } else {
        await axios.post(`${API}/pantry`, payload, { withCredentials: true });
        toast.success("Artikel hinzugefügt");
      }
      setShowForm(false);
      setEditId(null);
      fetchItems();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    try {
      await axios.delete(`${API}/pantry/${itemId}`, { withCredentials: true });
      setItems(prev => prev.filter(i => i.item_id !== itemId));
      toast.success("Artikel entfernt");
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  // Gruppierung nach Kategorie
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || "Sonstiges";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const expiringSoon = items.filter(i => {
    if (!i.expires_at) return false;
    return differenceInDays(parseISO(i.expires_at), new Date()) <= 3;
  });

  return (
    <Layout>
      <div className="animate-fade-in max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Speisekammer
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              {items.length} {items.length === 1 ? "Artikel" : "Artikel"} vorrätig
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchItems} className="btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" /> Hinzufügen
            </Button>
          </div>
        </div>

        {/* Ablauf-Warnung */}
        {expiringSoon.length > 0 && (
          <Card className="p-4 mb-6 bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">
                {expiringSoon.length} {expiringSoon.length === 1 ? "Artikel läuft" : "Artikel laufen"} bald ab: {expiringSoon.map(i => i.name).join(", ")}
              </span>
            </div>
          </Card>
        )}

        {/* Formular */}
        {showForm && (
          <Card className="p-5 mb-6 bg-white border-emerald-200">
            <h3 className="font-heading font-semibold text-[var(--text-primary)] mb-4">
              {editId ? "Artikel bearbeiten" : "Neuer Artikel"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Name</label>
                <input
                  type="text"
                  placeholder="z.B. Mehl"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Menge</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="500"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Einheit</label>
                <input
                  type="text"
                  placeholder="g, ml, Stück…"
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Kategorie</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">MHD (optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} disabled={saving} className="btn-primary">
                <Check className="w-4 h-4" /> {saving ? "Speichern…" : "Speichern"}
              </Button>
              <Button variant="outline" onClick={cancelForm} className="btn-secondary">
                <X className="w-4 h-4" /> Abbrechen
              </Button>
            </div>
          </Card>
        )}

        {/* Liste */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 bg-white border-gray-100 text-center">
            <Archive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Speisekammer leer
            </h3>
            <p className="text-[var(--text-muted)] mb-6">
              Füge Artikel hinzu oder hake sie in der Einkaufsliste ab.
            </p>
            <Button onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" /> Ersten Artikel hinzufügen
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catItems]) => (
              <Card key={cat} className="bg-white border-gray-100 overflow-hidden">
                <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="font-heading font-semibold text-sm text-[var(--text-primary)]">{cat}</span>
                  <span className="text-xs text-[var(--text-muted)] ml-2">({catItems.length})</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {catItems.map(item => (
                    <li key={item.item_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{item.name}</span>
                      </div>
                      <span className="font-mono text-sm text-[var(--text-secondary)] shrink-0">
                        {item.amount} {item.unit}
                      </span>
                      <ExpiryBadge expiresAt={item.expires_at} />
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.item_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Pantry;
