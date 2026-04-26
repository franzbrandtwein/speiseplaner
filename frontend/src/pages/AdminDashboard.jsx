import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  Users, Download, Upload, ChefHat, Calendar, Package,
  Eye, ArrowLeft, Search, Shield, AlertTriangle, Check, X
} from "lucide-react";
import { toast } from "sonner";

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [importMode, setImportMode] = useState("merge");
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/users`, { withCredentials: true });
      setUsers(res.data);
    } catch (e) {
      if (e.response?.status === 403) {
        toast.error("Kein Admin-Zugriff");
      } else {
        toast.error("Fehler beim Laden der User");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const viewUserData = async (userId) => {
    setUserDataLoading(true);
    setSelectedUser(userId);
    try {
      const res = await axios.get(`${API}/admin/users/${userId}/data`, { withCredentials: true });
      setUserData(res.data);
    } catch (e) {
      toast.error("Fehler beim Laden");
    } finally {
      setUserDataLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/admin/export`, {
        withCredentials: true,
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kochplaner_export_${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export heruntergeladen");
    } catch (e) {
      toast.error("Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await axios.post(`${API}/admin/import-upload?mode=${importMode}`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Import abgeschlossen");
      setImportDialog(false);
      setImportFile(null);
      fetchUsers();
      // Show stats
      const stats = res.data.stats || {};
      const summary = Object.entries(stats)
        .map(([k, v]) => `${k}: ${v.inserted || v.imported || 0} importiert`)
        .join(", ");
      if (summary) toast.info(summary);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import fehlgeschlagen");
    } finally {
      setImporting(false);
    }
  };

  const filtered = users.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  // User detail view
  if (selectedUser && userData) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto" data-testid="admin-user-detail">
          <Button variant="ghost" onClick={() => { setSelectedUser(null); setUserData(null); }} className="mb-4">
            <ArrowLeft className="w-4 h-4" /> Zurück
          </Button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">{userData.user?.name || "Unbekannt"}</h1>
              <p className="text-sm text-[var(--text-muted)]">{userData.user?.email} · {userData.user?.user_id}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Rezepte", count: userData.recipes?.length || 0, icon: ChefHat },
              { label: "Speisepläne", count: userData.meal_plans?.length || 0, icon: Calendar },
              { label: "Sonstige Artikel", count: userData.staple_items?.length || 0, icon: Package },
              { label: "Vorlagen", count: userData.templates?.length || 0, icon: Calendar },
            ].map(s => (
              <Card key={s.label} className="p-4 bg-white border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-[var(--text-muted)]">{s.label}</span>
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{s.count}</p>
              </Card>
            ))}
          </div>

          {/* Recipes */}
          <DataSection title="Rezepte" data={userData.recipes} renderItem={r => (
            <div key={r.recipe_id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-medium text-sm text-[var(--text-primary)]">{r.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{r.category || "Ohne Kategorie"} · {r.ingredients?.length || 0} Zutaten</p>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{r.recipe_id}</span>
            </div>
          )} />

          {/* Meal Plans */}
          <DataSection title="Speisepläne" data={userData.meal_plans} renderItem={p => (
            <div key={p.plan_id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <p className="font-medium text-sm text-[var(--text-primary)]">Woche ab {p.week_start}</p>
              <span className="text-xs text-[var(--text-muted)]">{p.days?.length || 0} Tage</span>
            </div>
          )} />

          {/* Staple Items */}
          <DataSection title="Sonstige Artikel" data={userData.staple_items} renderItem={s => (
            <div key={s.item_id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <p className="font-medium text-sm text-[var(--text-primary)]">{s.name}</p>
              <span className="text-xs text-[var(--text-muted)]">{s.amount} {s.unit} · {s.category}</span>
            </div>
          )} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto" data-testid="admin-dashboard">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-500" />
              <h1 className="font-heading text-4xl sm:text-5xl font-bold text-[var(--text-primary)]">
                Admin
              </h1>
            </div>
            <p className="text-[var(--text-secondary)] mt-1">Datenverwaltung und Benutzerübersicht</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} disabled={exporting} className="btn-primary" data-testid="admin-export-btn">
              <Download className="w-4 h-4" /> {exporting ? "Exportiert..." : "Export ZIP"}
            </Button>
            <Button variant="outline" onClick={() => setImportDialog(true)} className="btn-secondary" data-testid="admin-import-btn">
              <Upload className="w-4 h-4" /> Import ZIP
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="p-4 bg-white border-gray-100">
            <p className="text-xs text-[var(--text-muted)] mb-1">Benutzer</p>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{users.length}</p>
          </Card>
          <Card className="p-4 bg-white border-gray-100">
            <p className="text-xs text-[var(--text-muted)] mb-1">Rezepte gesamt</p>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{users.reduce((s, u) => s + (u.recipe_count || 0), 0)}</p>
          </Card>
          <Card className="p-4 bg-white border-gray-100">
            <p className="text-xs text-[var(--text-muted)] mb-1">Speisepläne</p>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{users.reduce((s, u) => s + (u.plan_count || 0), 0)}</p>
          </Card>
          <Card className="p-4 bg-white border-gray-100">
            <p className="text-xs text-[var(--text-muted)] mb-1">Sonstige Artikel</p>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{users.reduce((s, u) => s + (u.staple_count || 0), 0)}</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Benutzer suchen..."
            className="pl-10"
            data-testid="admin-user-search"
          />
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => (
              <Card key={u.user_id} className="p-4 bg-white border-gray-100 hover:border-emerald-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      {u.picture ? (
                        <img src={u.picture} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <Users className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-[var(--text-primary)]">{u.name || "Ohne Name"}</p>
                        {u.email === users[0]?.email && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Admin</span>}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex gap-4 text-xs text-[var(--text-muted)]">
                      <span>{u.recipe_count} Rezepte</span>
                      <span>{u.plan_count} Pläne</span>
                      <span>{u.staple_count} Artikel</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => viewUserData(u.user_id)} data-testid={`view-user-${u.user_id}`}>
                      <Eye className="w-4 h-4" /> Details
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-[var(--text-muted)] py-8">Keine Benutzer gefunden</p>
            )}
          </div>
        )}

        {/* Import Dialog */}
        <Dialog open={importDialog} onOpenChange={setImportDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Daten importieren</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Mode selection */}
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Import-Modus</p>
                <div className="flex gap-2">
                  {[
                    { id: "merge", label: "Zusammenführen", desc: "Neue Daten hinzufügen, bestehende behalten" },
                    { id: "overwrite", label: "Überschreiben", desc: "Alle Daten ersetzen" }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setImportMode(m.id)}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                        importMode === m.id
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-gray-200 bg-white hover:border-emerald-200"
                      }`}
                      data-testid={`import-mode-${m.id}`}
                    >
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-[var(--text-muted)]">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {importMode === "overwrite" && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">Alle bestehenden Daten werden unwiderruflich gelöscht und durch die importierten Daten ersetzt!</p>
                </div>
              )}

              {/* File input */}
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-2">ZIP-Datei auswählen</p>
                <Input
                  type="file"
                  accept=".zip"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                  data-testid="import-file-input"
                />
              </div>

              <Button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="btn-primary w-full"
                data-testid="confirm-import-btn"
              >
                {importing ? "Importiert..." : (
                  <><Upload className="w-4 h-4" /> {importMode === "overwrite" ? "Überschreiben und importieren" : "Zusammenführen und importieren"}</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

// Reusable data section component
const DataSection = ({ title, data, renderItem }) => {
  const [expanded, setExpanded] = useState(false);
  if (!data || data.length === 0) return null;
  const shown = expanded ? data : data.slice(0, 5);

  return (
    <Card className="p-4 bg-white border-gray-100 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
        <span className="text-sm text-[var(--text-muted)]">{data.length} Einträge</span>
      </div>
      <div>{shown.map(renderItem)}</div>
      {data.length > 5 && (
        <Button variant="ghost" onClick={() => setExpanded(!expanded)} className="mt-2 text-sm text-emerald-600 w-full">
          {expanded ? "Weniger anzeigen" : `Alle ${data.length} anzeigen`}
        </Button>
      )}
    </Card>
  );
};

export default AdminDashboard;
