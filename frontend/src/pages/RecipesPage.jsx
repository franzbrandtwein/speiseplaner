import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  ChefHat, Plus, Search, Filter, Star, Clock, Users, X, Download, Sparkles, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Loader2
} from "lucide-react";
import RecipeImportDialog from "../components/RecipeImportDialog";
import { toast } from "sonner";

const RecipesPage = () => {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Hauptgericht");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showEstimatePanel, setShowEstimatePanel] = useState(false);
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiUsage, setGeminiUsage] = useState({});
  const [selectedModel, setSelectedModel] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateProgress, setEstimateProgress] = useState(null);
  const estimateSourceRef = useRef(null);

  const fetchData = async () => {
    try {
      const [recipesRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/recipes`, { withCredentials: true }),
        axios.get(`${API}/categories`, { withCredentials: true })
      ]);
      setRecipes(recipesRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error("Error fetching recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchGeminiModels = async () => {
    try {
      const [modelsRes, usageRes] = await Promise.all([
        axios.get(`${API}/recipes/gemini-models`, { withCredentials: true }),
        axios.get(`${API}/recipes/gemini-usage`, { withCredentials: true }),
      ]);
      setGeminiModels(modelsRes.data.models || []);
      setGeminiUsage(usageRes.data || {});
      if (modelsRes.data.models?.length > 0 && !selectedModel) {
        setSelectedModel(modelsRes.data.models[0].id);
      }
    } catch {
      setGeminiModels([]);
    }
  };

  const handleToggleEstimatePanel = () => {
    const next = !showEstimatePanel;
    setShowEstimatePanel(next);
    if (next && geminiModels.length === 0) fetchGeminiModels();
  };

  const handleStartEstimation = () => {
    if (estimateSourceRef.current) estimateSourceRef.current.close();
    setEstimateProgress({ index: 0, total: 0, recipe: "", succeeded: 0, failed: 0, done: false, results: [] });
    setEstimating(true);

    const url = `${API}/recipes/estimate-nutrition-stream?model=${encodeURIComponent(selectedModel)}`;
    const es = new EventSource(url, { withCredentials: true });
    estimateSourceRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start") {
        setEstimateProgress(prev => ({ ...prev, total: msg.total }));
      } else if (msg.type === "progress") {
        setEstimateProgress(prev => ({ ...prev, index: msg.index, recipe: msg.recipe }));
      } else if (msg.type === "result") {
        setEstimateProgress(prev => ({
          ...prev,
          succeeded: prev.succeeded + (msg.success ? 1 : 0),
          failed: prev.failed + (msg.success ? 0 : 1),
          results: [{ name: msg.recipe, success: msg.success, error: msg.error }, ...prev.results].slice(0, 50),
        }));
      } else if (msg.type === "done") {
        setEstimating(false);
        setEstimateProgress(prev => ({ ...prev, done: true, total: msg.total, succeeded: msg.succeeded, failed: msg.failed }));
        es.close();
        // Verbrauch aktualisieren
        axios.get(`${API}/recipes/gemini-usage`, { withCredentials: true })
          .then(r => setGeminiUsage(r.data || {})).catch(() => {});
        if (msg.succeeded > 0) {
          fetchData();
          toast.success(`${msg.succeeded} Rezepte mit Nährwerten ergänzt`);
        } else if (msg.total === 0) {
          toast.info("Alle Rezepte haben bereits vollständige Nährwerte");
        }
      }
    };
    es.onerror = () => {
      setEstimating(false);
      setEstimateProgress(prev => prev ? { ...prev, done: true } : prev);
      es.close();
      toast.error("Verbindungsfehler beim Schätzen");
    };
  };

  const handleCancelEstimation = () => {
    if (estimateSourceRef.current) estimateSourceRef.current.close();
    setEstimating(false);
    setEstimateProgress(prev => prev ? { ...prev, done: true } : prev);
  };


  const handleImported = (action) => {
    if (action === 'edit') {
      navigate('/recipes/new?from_import=1');
    } else {
      fetchData();
    }
  };

  const filteredRecipes = recipes.filter(recipe => {
    const matchesSearch = !search || 
      recipe.name.toLowerCase().includes(search.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "__all__" || !categoryFilter || recipe.category === categoryFilter;
    const matchesDifficulty = !difficultyFilter || recipe.difficulty === difficultyFilter;
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("Hauptgericht");
    setDifficultyFilter("");
  };

  const hasActiveFilters = search || (categoryFilter && categoryFilter !== "Hauptgericht") || difficultyFilter;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  return (
    <>
    <Layout>
      <div className="animate-fade-in" data-testid="recipes-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Rezepte
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              {recipes.length} Rezepte in deiner Sammlung
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleToggleEstimatePanel}
              variant="outline"
              className="border-violet-200 text-violet-700 hover:bg-violet-50"
              title="Nährwerte für alle Rezepte ohne Angaben via KI schätzen"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Nährwerte schätzen
              {showEstimatePanel ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
            </Button>
            <Button
              onClick={() => setShowImport(true)}
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Importieren
            </Button>
            <Link to="/recipes/new">
              <Button className="btn-primary" data-testid="add-recipe-button">
                <Plus className="w-5 h-5" />
                Neues Rezept
              </Button>
            </Link>
          </div>
        </div>

        {/* Nährwert-Schätz-Panel */}
        {showEstimatePanel && (
          <Card className="p-5 mb-6 border-violet-200 bg-violet-50">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-violet-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  KI-Nährwertschätzung
                </h2>
                <button onClick={() => setShowEstimatePanel(false)} className="text-violet-400 hover:text-violet-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-violet-700 mb-1">Gemini-Modell</label>
                  {geminiModels.length > 0 ? (
                    <>
                      <Select value={selectedModel} onValueChange={setSelectedModel} disabled={estimating}>
                        <SelectTrigger className="bg-white border-violet-200">
                          <SelectValue placeholder="Modell wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {geminiModels.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedModel && (() => {
                        const m = geminiModels.find(x => x.id === selectedModel);
                        const usage = geminiUsage[selectedModel] || { rpd: 0, rpm: 0 };
                        if (!m?.limits) return null;
                        const bars = [
                          { label: "Req/min", used: usage.rpm, limit: m.limits.rpm, fmt: v => v.toLocaleString() },
                          { label: "Req/Tag", used: usage.rpd, limit: m.limits.rpd, fmt: v => v.toLocaleString() },
                          { label: "Token/min", used: 0, limit: m.limits.tpm, fmt: v => `${(v/1000).toLocaleString()}k`, note: true },
                        ];
                        return (
                          <div className="mt-2 space-y-1.5">
                            {bars.map(({ label, used, limit, fmt, note }) => {
                              const pct = Math.min((used / limit) * 100, 100);
                              const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-400" : "bg-violet-500";
                              return (
                                <div key={label} className="flex items-center gap-2">
                                  <span className="text-xs text-violet-500 w-16 shrink-0">{label}</span>
                                  <div className="flex-1 bg-violet-200 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-violet-600 whitespace-nowrap w-24 text-right">
                                    {note ? "–" : fmt(used)} / {fmt(limit)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-sm text-violet-500 italic">Lade Modelle…</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!estimating && !estimateProgress?.done && (
                    <Button
                      onClick={handleStartEstimation}
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                      disabled={!selectedModel || estimating}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Starten
                    </Button>
                  )}
                  {estimating && (
                    <Button onClick={handleCancelEstimation} variant="outline" className="border-violet-300 text-violet-700">
                      Abbrechen
                    </Button>
                  )}
                  {estimateProgress?.done && (
                    <Button onClick={() => { setEstimateProgress(null); }} variant="outline" className="border-violet-300 text-violet-700">
                      Neue Schätzung
                    </Button>
                  )}
                </div>
              </div>

              {/* Fortschritt */}
              {estimateProgress && (
                <div className="space-y-3">
                  {!estimateProgress.done && estimateProgress.total > 0 && (
                    <div>
                      <div className="flex justify-between text-sm text-violet-600 mb-1">
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {estimateProgress.recipe}
                        </span>
                        <span>{estimateProgress.index}/{estimateProgress.total}</span>
                      </div>
                      <div className="w-full bg-violet-200 rounded-full h-2">
                        <div
                          className="bg-violet-600 h-2 rounded-full transition-all"
                          style={{ width: `${estimateProgress.total > 0 ? (estimateProgress.index / estimateProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {estimateProgress.done && (
                    <p className="text-sm font-medium text-violet-800">
                      Abgeschlossen: {estimateProgress.succeeded} erfolgreich, {estimateProgress.failed} fehlgeschlagen
                    </p>
                  )}

                  {estimateProgress.results.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {estimateProgress.results.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          {r.success
                            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            : <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          }
                          <span className={r.success ? "text-gray-700" : "text-red-600"}>
                            {r.name}{r.error ? ` – ${r.error}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Filters */}
        <Card className="p-4 mb-6 bg-white border-gray-100">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <Input
                placeholder="Rezepte suchen..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 input-field"
                data-testid="search-input"
              />
            </div>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="category-filter">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle</SelectItem>
                {categories.categories?.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-full md:w-40" data-testid="difficulty-filter">
                <SelectValue placeholder="Schwierigkeit" />
              </SelectTrigger>
              <SelectContent>
                {categories.difficulties?.map(diff => (
                  <SelectItem key={diff} value={diff} className="capitalize">{diff}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                onClick={clearFilters}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4 mr-1" /> Zurücksetzen
              </Button>
            )}
          </div>
        </Card>

        {/* Recipe Grid */}
        {filteredRecipes.length === 0 ? (
          <div className="text-center py-16">
            <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              {hasActiveFilters ? "Keine Rezepte gefunden" : "Noch keine Rezepte"}
            </h3>
            <p className="text-[var(--text-muted)] mb-6">
              {hasActiveFilters 
                ? "Versuche andere Filterkriterien" 
                : "Erstelle dein erstes Rezept und starte deine Sammlung"}
            </p>
            {!hasActiveFilters && (
              <Link to="/recipes/new">
                <Button className="btn-primary">
                  <Plus className="w-5 h-5" />
                  Erstes Rezept erstellen
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRecipes.map(recipe => (
              <RecipeCard key={recipe.recipe_id} recipe={recipe} />
            ))}
          </div>
        )}
      </div>
    </Layout>

    <RecipeImportDialog
      open={showImport}
      onClose={() => setShowImport(false)}
      onImported={handleImported}
    />
    </>
  );
};

const RecipeCard = ({ recipe }) => {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  
  return (
    <Link to={`/recipes/${recipe.recipe_id}`} data-testid={`recipe-card-${recipe.recipe_id}`}>
      <Card className="card-recipe group">
        {/* Image */}
        <div className="aspect-[4/3] overflow-hidden bg-gray-100">
          {recipe.image_url ? (
            <img 
              src={recipe.image_url?.startsWith("/api") ? `${API.replace("/api", "")}${recipe.image_url}` : recipe.image_url} 
              alt={recipe.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={e => { e.target.onerror = null; e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300"><path d="M17 21.5H7a4 4 0 0 1-4-4v-11a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a4 4 0 0 1-4 4Z"/><path d="m12 9.5-4 6h8Z"/></svg></div>'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ChefHat className="w-12 h-12 text-gray-300" />
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
              {recipe.category}
            </span>
            {recipe.avg_rating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {recipe.avg_rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          
          <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-2 group-hover:text-emerald-600 transition-colors line-clamp-2">
            {recipe.name}
          </h3>
          
          {recipe.description && (
            <p className="text-sm text-[var(--text-muted)] line-clamp-2 mb-3 flex-1">
              {recipe.description}
            </p>
          )}
          
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] mt-auto pt-3 border-t border-gray-100">
            {totalTime > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {totalTime} Min
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {recipe.portions} Port.
            </div>
            <span className="capitalize px-2 py-0.5 bg-gray-100 rounded text-xs">
              {recipe.difficulty}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
};

export default RecipesPage;
