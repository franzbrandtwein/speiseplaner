import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ScrollText, RefreshCw, Trash2, Info, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

const LEVEL_CONFIG = {
  info:    { label: "Info",    icon: Info,          classes: "bg-blue-50 text-blue-700 border-blue-200" },
  warning: { label: "Warnung", icon: AlertTriangle,  classes: "bg-amber-50 text-amber-700 border-amber-200" },
  error:   { label: "Fehler",  icon: XCircle,        classes: "bg-red-50 text-red-700 border-red-200" },
};

const SOURCE_LABELS = {
  nutrition_estimation: "Nährwert-Schätzung",
  recipe_import:        "Rezept-Import",
  ocr:                  "OCR / Speisekarte",
};

const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" });
};

export default function LogsPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("__all__");
  const [levelFilter, setLevelFilter] = useState("__all__");
  const [expanded, setExpanded] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (sourceFilter !== "__all__") params.source = sourceFilter;
      if (levelFilter !== "__all__") params.level = levelFilter;
      const { data } = await axios.get(`${API}/logs`, { params, withCredentials: true });
      setEntries(data);
    } catch (err) {
      toast.error("Logs konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, levelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleClear = async () => {
    if (!window.confirm("Alle sichtbaren Log-Einträge wirklich löschen?")) return;
    try {
      const params = {};
      if (sourceFilter !== "__all__") params.source = sourceFilter;
      const { data } = await axios.delete(`${API}/logs`, { params, withCredentials: true });
      toast.success(`${data.deleted} Einträge gelöscht`);
      fetchLogs();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  // Alle vorhandenen Sources aus den Einträgen ableiten
  const knownSources = [...new Set(entries.map(e => e.source))];

  return (
    <Layout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">
                Protokoll
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {entries.length} Eintrag{entries.length !== 1 ? "e" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleClear}
              disabled={entries.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Löschen
            </Button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-3 mb-4">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Alle Quellen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Quellen</SelectItem>
              {knownSources.map(s => (
                <SelectItem key={s} value={s}>{SOURCE_LABELS[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Alle Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Level</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warnung</SelectItem>
              <SelectItem value="error">Fehler</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Einträge */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <Card className="p-12 text-center bg-white border-gray-100">
            <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-[var(--text-secondary)]">Keine Einträge vorhanden</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const cfg = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.info;
              const Icon = cfg.icon;
              const isOpen = expanded === entry.log_id;
              const hasDetails = entry.details && Object.keys(entry.details).length > 0;

              return (
                <Card
                  key={entry.log_id}
                  className={`border px-4 py-3 bg-white transition-all ${hasDetails ? "cursor-pointer hover:shadow-sm" : ""}`}
                  onClick={() => hasDetails && setExpanded(isOpen ? null : entry.log_id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Level-Badge */}
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${cfg.classes}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>

                    {/* Inhalt */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          {SOURCE_LABELS[entry.source] ?? entry.source}
                        </span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{fmtTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5">{entry.message}</p>

                      {/* Details aufgeklappt */}
                      {isOpen && hasDetails && (
                        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs font-mono text-gray-600 overflow-x-auto">
                          {Object.entries(entry.details).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-gray-400 shrink-0">{k}:</span>
                              <span className="break-all">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expand-Indikator */}
                    {hasDetails && (
                      <span className="text-gray-300 text-xs shrink-0 mt-1">{isOpen ? "▲" : "▼"}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
