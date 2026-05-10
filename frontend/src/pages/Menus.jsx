import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { toast } from "sonner";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  BookOpen, MapPin, Plus, Pencil, Trash2, ChevronRight, Utensils,
} from "lucide-react";

// ─── Anlegen/Bearbeiten Dialog ────────────────────────────────────────────────
const MenuDialog = ({ open, onClose, onSave, initial, sources }) => {
  const [form, setForm] = useState({ name: "", source_id: "", notes: "" });

  useEffect(() => {
    setForm(
      initial
        ? { name: initial.name, source_id: initial.source_id || "", notes: initial.notes || "" }
        : { name: "", source_id: "", notes: "" }
    );
  }, [initial, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial ? "Speisekarte bearbeiten" : "Neue Speisekarte"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1 block">Name *</Label>
            <Input
              placeholder="z.B. Wochenkarte Pizzeria Mario"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1 block">Bezugsquelle</Label>
            <select
              className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm bg-white"
              value={form.source_id}
              onChange={e => set("source_id", e.target.value)}
            >
              <option value="">– keine –</option>
              {sources.map(s => (
                <option key={s.source_id} value={s.source_id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block">Notiz (optional)</Label>
            <Input
              placeholder="z.B. Gültig bis Ende Mai"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button
              onClick={() => onSave({ ...form, source_id: form.source_id || null })}
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

// ─── Löschen-Dialog ───────────────────────────────────────────────────────────
const DeleteDialog = ({ open, menu, onClose, onConfirm }) => {
  const [deleteRecipes, setDeleteRecipes] = useState(false);
  useEffect(() => { if (open) setDeleteRecipes(false); }, [open]);

  if (!menu) return null;
  const recipeCount = menu.recipe_ids?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-red-700">Speisekarte löschen</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          „<strong>{menu.name}</strong>" wirklich löschen?
        </p>
        {recipeCount > 0 && (
          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50 border-red-200">
            <input
              type="checkbox"
              className="mt-0.5 accent-red-500"
              checked={deleteRecipes}
              onChange={e => setDeleteRecipes(e.target.checked)}
            />
            <span className="text-sm text-red-700">
              Auch die <strong>{recipeCount} verknüpften Gerichte</strong> löschen
            </span>
          </label>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(deleteRecipes)}
            className="flex-1"
          >
            Löschen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────
export default function Menus() {
  const navigate = useNavigate();
  const [menus, setMenus] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMenu, setEditMenu] = useState(null);
  const [deleteMenu, setDeleteMenu] = useState(null);

  const load = useCallback(async () => {
    try {
      const [menusRes, sourcesRes] = await Promise.all([
        axios.get(`${API}/menus`, { withCredentials: true }),
        axios.get(`${API}/sources`, { withCredentials: true }),
      ]);
      setMenus(menusRes.data || []);
      setSources(sourcesRes.data || []);
    } catch {
      toast.error("Speisekarten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editMenu) {
        const { data } = await axios.put(`${API}/menus/${editMenu.menu_id}`, form, { withCredentials: true });
        setMenus(prev => prev.map(m => m.menu_id === editMenu.menu_id ? data : m));
        toast.success("Speisekarte aktualisiert");
      } else {
        const { data } = await axios.post(`${API}/menus`, form, { withCredentials: true });
        setMenus(prev => [data, ...prev]);
        toast.success("Speisekarte erstellt");
      }
      setDialogOpen(false);
      setEditMenu(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fehler beim Speichern");
    }
  };

  const handleDelete = async (withRecipes) => {
    try {
      await axios.delete(
        `${API}/menus/${deleteMenu.menu_id}?delete_recipes=${withRecipes}`,
        { withCredentials: true }
      );
      setMenus(prev => prev.filter(m => m.menu_id !== deleteMenu.menu_id));
      toast.success(withRecipes ? "Speisekarte und Gerichte gelöscht" : "Speisekarte gelöscht");
      setDeleteMenu(null);
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">Speisekarten</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Speisekarten von Restaurants & Lieferdiensten verwalten
            </p>
          </div>
          <Button
            className="btn-primary"
            onClick={() => { setEditMenu(null); setDialogOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-2" /> Neue Speisekarte
          </Button>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)]">Lade…</div>
        ) : menus.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-[var(--text-primary)]">Noch keine Speisekarten</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Lege deine erste Speisekarte an</p>
            <Button
              className="btn-primary mt-4"
              onClick={() => { setEditMenu(null); setDialogOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-2" /> Jetzt anlegen
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {menus.map(menu => (
              <Card
                key={menu.menu_id}
                className="p-5 bg-white hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/menus/${menu.menu_id}`)}
              >
                <div className="flex items-center gap-4">
                  {/* Vorschau-Bild oder Platzhalter */}
                  {menu.images?.[0] ? (
                    <img
                      src={menu.images[0].startsWith("/api") ? `${API.replace("/api", "")}${menu.images[0]}` : menu.images[0]}
                      alt={menu.name}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-7 h-7 text-amber-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--text-primary)] truncate">{menu.name}</h3>
                    {menu.source && (
                      <p className="text-sm text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {menu.source.name}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                        <Utensils className="w-3 h-3" />
                        {menu.recipe_ids?.length || 0} Gerichte
                      </span>
                      {menu.notes && (
                        <span className="text-xs text-[var(--text-muted)] truncate max-w-xs">{menu.notes}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditMenu(menu); setDialogOpen(true); }}
                    >
                      <Pencil className="w-4 h-4 text-gray-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteMenu(menu)}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-gray-300 ml-1" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <MenuDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditMenu(null); }}
        onSave={handleSave}
        initial={editMenu}
        sources={sources}
      />
      <DeleteDialog
        open={!!deleteMenu}
        menu={deleteMenu}
        onClose={() => setDeleteMenu(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  );
}
