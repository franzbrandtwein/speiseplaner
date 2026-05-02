import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Upload, Users, Search, X, Check, Sparkles } from "lucide-react";

/** Autocomplete-Eingabefeld für Zutaten mit Stammdaten-Verknüpfung */
const IngredientNameInput = ({ value, ingredientId, onChange, onCreateNew, allIngredients, idx }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const [creating, setCreating] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync external value changes (e.g. when editing existing recipe)
  useEffect(() => { setQuery(value ?? ""); }, [value]);

  const suggestions = query.trim().length === 0
    ? allIngredients.slice(0, 8)
    : allIngredients
        .filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);

  const exactMatch = allIngredients.find(
    i => i.name.toLowerCase() === query.toLowerCase()
  );

  const handleSelect = (ingredient) => {
    setQuery(ingredient.name);
    onChange(ingredient.name, ingredient.ingredient_id);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v, null); // clear ingredient_id when typing freely
    setOpen(true);
  };

  const handleCreateNew = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    setOpen(false);
    const created = await onCreateNew(name);
    setCreating(false);
    if (created) {
      setQuery(created.name);
      onChange(created.name, created.ingredient_id);
    }
  };

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 150);
  }, []);

  return (
    <div className="relative w-full sm:flex-1 sm:w-auto" ref={containerRef}>
      <div className={`flex items-center gap-1.5 border rounded-lg px-3 h-10 bg-white focus-within:ring-1 transition-colors ${
        ingredientId
          ? "border-emerald-400 focus-within:ring-emerald-400"
          : "border-gray-200 focus-within:border-emerald-400 focus-within:ring-emerald-400"
      }`}>
        {creating
          ? <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          : ingredientId && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        }
        <input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="Zutat"
          className="flex-1 outline-none text-base bg-transparent text-[var(--text-primary)] placeholder:text-gray-400 min-w-0"
          data-testid={`ingredient-name-${idx}`}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map(ing => (
            <button
              key={ing.ingredient_id}
              type="button"
              onMouseDown={() => handleSelect(ing)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
            >
              <Check className={`w-3.5 h-3.5 flex-shrink-0 ${ing.ingredient_id === ingredientId ? "text-emerald-500" : "text-transparent"}`} />
              <span className="text-sm text-[var(--text-primary)] truncate">{ing.name}</span>
              <span className="text-xs text-[var(--text-muted)] ml-auto">{ing.category}</span>
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={handleCreateNew}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-amber-50 text-left border-t border-gray-100 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-sm text-amber-700">Neu anlegen: <strong>{query.trim()}</strong></span>
            </button>
          )}
          {suggestions.length === 0 && !query.trim() && (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">Keine Zutaten vorhanden</div>
          )}
        </div>
      )}
    </div>
  );
};

const RecipeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  const fromImport = searchParams.get('from_import') === '1';
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState({ categories: [], difficulties: [], allergens: [] });
  const [hasGroup, setHasGroup] = useState(false);
  const [allRecipes, setAllRecipes] = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [sideDishSearch, setSideDishSearch] = useState("");
  const [showSideDishDropdown, setShowSideDishDropdown] = useState(false);
  const [existingImages, setExistingImages] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "Hauptgericht",
    difficulty: "mittel",
    portions: 4,
    prep_time: "",
    cook_time: "",
    image_url: "",
    cost_per_portion: "",
    ingredients: [{ name: "", amount: "", unit: "g", ingredient_id: null }],
    instructions: [""],
    nutrition: {
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
      fiber: ""
    },
    allergens: [],
    side_dishes: [],
    shared_with_group: false
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, groupRes, recipesRes, ingredientsRes] = await Promise.all([
          axios.get(`${API}/categories`, { withCredentials: true }),
          axios.get(`${API}/groups/my`, { withCredentials: true }),
          axios.get(`${API}/recipes`, { withCredentials: true }),
          axios.get(`${API}/ingredients`, { withCredentials: true }),
        ]);
        setCategories(catRes.data);
        setHasGroup(groupRes.data.group !== null);
        setAllRecipes(recipesRes.data || []);
        setAllIngredients(ingredientsRes.data || []);
        
        if (isEditing) {
          const recipeRes = await axios.get(`${API}/recipes/${id}`, { withCredentials: true });
          const recipe = recipeRes.data;
          setExistingImages(recipe.images || (recipe.image_url ? [recipe.image_url] : []));
          setFormData({
            name: recipe.name || "",
            description: recipe.description || "",
            category: recipe.category || "Hauptgericht",
            difficulty: recipe.difficulty || "mittel",
            portions: recipe.portions || 4,
            prep_time: recipe.prep_time || "",
            cook_time: recipe.cook_time || "",
            image_url: recipe.image_url || "",
            cost_per_portion: recipe.cost_per_portion || "",
            ingredients: recipe.ingredients?.length ? recipe.ingredients : [{ name: "", amount: "", unit: "g" }],
            instructions: recipe.instructions?.length ? recipe.instructions : [""],
            nutrition: recipe.nutrition || { calories: "", protein: "", carbs: "", fat: "", fiber: "" },
            allergens: recipe.allergens || [],
            side_dishes: recipe.side_dishes || [],
            shared_with_group: recipe.shared_with_group || false
          });
        } else if (fromImport) {
          // Load imported recipe draft from sessionStorage
          const draft = sessionStorage.getItem('import_recipe_draft');
          if (draft) {
            try {
              const recipe = JSON.parse(draft);
              setFormData({
                name: recipe.name || "",
                description: recipe.description || "",
                category: recipe.category || "Hauptgericht",
                difficulty: recipe.difficulty || "mittel",
                portions: recipe.portions || 4,
                prep_time: recipe.prep_time || "",
                cook_time: recipe.cook_time || "",
                image_url: recipe.image_url || "",
                cost_per_portion: recipe.cost_per_portion || "",
                ingredients: recipe.ingredients?.length ? recipe.ingredients : [{ name: "", amount: "", unit: "g" }],
                instructions: recipe.instructions?.length ? recipe.instructions : [""],
                nutrition: recipe.nutrition || { calories: "", protein: "", carbs: "", fat: "", fiber: "" },
                allergens: recipe.allergens || [],
                side_dishes: recipe.side_dishes || [],
                shared_with_group: recipe.shared_with_group || false
              });
              sessionStorage.removeItem('import_recipe_draft');
              toast.success("Importiertes Rezept geladen – bitte prüfen und speichern.");
            } catch (e) {
              console.error("Failed to load import draft:", e);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Daten konnten nicht geladen werden");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEditing]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateIngredientName = (index, name, ingredientId) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = { ...newIngredients[index], name, ingredient_id: ingredientId };
    updateField("ingredients", newIngredients);
  };

  const handleCreateIngredient = useCallback(async (name) => {
    try {
      const { data: found } = await axios.get(
        `${API}/ingredients/lookup?name=${encodeURIComponent(name)}`,
        { withCredentials: true }
      );
      if (found) {
        toast.info(`"${found.name}" bereits in Stammdaten vorhanden`);
        setAllIngredients(prev => prev.some(i => i.ingredient_id === found.ingredient_id) ? prev : [...prev, found]);
        return found;
      }
      const { data: created } = await axios.post(
        `${API}/ingredients`,
        { name, category: "Sonstiges", shared_with_group: true },
        { withCredentials: true }
      );
      setAllIngredients(prev => [...prev, created]);
      toast.success(`Zutat "${name}" in Stammdaten angelegt`);
      return created;
    } catch (err) {
      if (err.response?.status === 409) {
        const { data: retry } = await axios.get(
          `${API}/ingredients/lookup?name=${encodeURIComponent(name)}`,
          { withCredentials: true }
        );
        if (retry) return retry;
      }
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Fehler beim Anlegen von "${name}": ${msg}`);
      return null;
    }
  }, []);

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    updateField("ingredients", newIngredients);
  };

  const addIngredient = () => {
    const newIdx = formData.ingredients.length;
    updateField("ingredients", [...formData.ingredients, { name: "", amount: "", unit: "g", ingredient_id: null }]);
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="ingredient-name-${newIdx}"]`);
      if (el) el.focus();
    }, 50);
  };

  const removeIngredient = (index) => {
    if (formData.ingredients.length > 1) {
      updateField("ingredients", formData.ingredients.filter((_, i) => i !== index));
    }
  };

  const updateInstruction = (index, value) => {
    const newInstructions = [...formData.instructions];
    newInstructions[index] = value;
    updateField("instructions", newInstructions);
  };

  const addInstruction = () => {
    updateField("instructions", [...formData.instructions, ""]);
  };

  const removeInstruction = (index) => {
    if (formData.instructions.length > 1) {
      updateField("instructions", formData.instructions.filter((_, i) => i !== index));
    }
  };

  const toggleAllergen = (allergen) => {
    const current = formData.allergens;
    if (current.includes(allergen)) {
      updateField("allergens", current.filter(a => a !== allergen));
    } else {
      updateField("allergens", [...current, allergen]);
    }
  };

  const updateNutrition = (field, value) => {
    setFormData(prev => ({
      ...prev,
      nutrition: { ...prev.nutrition, [field]: value }
    }));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
  };

  const removePendingFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const removeExistingImage = async (imageUrl) => {
    if (!id) return;
    try {
      await axios.delete(`${API}/recipes/${id}/images`, {
        data: { image_url: imageUrl }, withCredentials: true
      });
      setExistingImages(prev => prev.filter(u => u !== imageUrl));
      toast.success("Bild entfernt");
    } catch {
      toast.error("Fehler beim Entfernen");
    }
  };

  const uploadFiles = async (recipeId) => {
    if (!pendingFiles.length) return;
    setUploading(true);
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await axios.post(`${API}/recipes/${recipeId}/images`, fd, { withCredentials: true });
      } catch (err) {
        console.error("Upload error:", err);
        toast.error(`Fehler beim Hochladen von ${file.name}`);
      }
    }
    setPendingFiles([]);
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Bitte gib einen Namen ein");
      return;
    }

    setSaving(true);
    try {
      // Zutaten ohne ingredient_id per Name nachschlagen (für Altdaten / nach Neu-anlegen)
      const resolvedIngredients = await Promise.all(
        formData.ingredients
          .filter(i => i.name.trim())
          .map(async (ing) => {
            if (ing.ingredient_id) return ing;
            const name = ing.name.trim();
            try {
              const { data: found } = await axios.get(
                `${API}/ingredients/lookup?name=${encodeURIComponent(name)}`,
                { withCredentials: true }
              );
              if (found) return { ...ing, ingredient_id: found.ingredient_id };
            } catch {
              // Fehler ignorieren – Rezept trotzdem speichern
            }
            return ing;
          })
      );

      const payload = {
        ...formData,
        prep_time: formData.prep_time ? parseInt(formData.prep_time) : null,
        cook_time: formData.cook_time ? parseInt(formData.cook_time) : null,
        cost_per_portion: formData.cost_per_portion ? parseFloat(formData.cost_per_portion) : null,
        ingredients: resolvedIngredients,
        instructions: formData.instructions.filter(i => i.trim()),
        nutrition: {
          calories: formData.nutrition.calories ? parseInt(formData.nutrition.calories) : null,
          protein: formData.nutrition.protein ? parseFloat(formData.nutrition.protein) : null,
          carbs: formData.nutrition.carbs ? parseFloat(formData.nutrition.carbs) : null,
          fat: formData.nutrition.fat ? parseFloat(formData.nutrition.fat) : null,
          fiber: formData.nutrition.fiber ? parseFloat(formData.nutrition.fiber) : null
        }
      };

      if (isEditing) {
        await axios.put(`${API}/recipes/${id}`, payload, { withCredentials: true });
        await uploadFiles(id);
        toast.success("Rezept aktualisiert");
      } else {
        const response = await axios.post(`${API}/recipes`, payload, { withCredentials: true });
        await uploadFiles(response.data.recipe_id);
        toast.success("Rezept erstellt");
        navigate(`/recipes/${response.data.recipe_id}`);
        return;
      }
      navigate(`/recipes/${id}`);
    } catch (error) {
      console.error("Error saving recipe:", error);
      // Backend-Fehlermeldung auswerten (FastAPI 422 / 400 / 500)
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Pydantic-Validierungsfehler: Array von {loc, msg, type}
        const messages = detail.map(d => {
          const field = d.loc?.slice(1).join(" → ") || "";
          return field ? `${field}: ${d.msg}` : d.msg;
        });
        toast.error(`Validierungsfehler:\n${messages.join("\n")}`);
      } else if (typeof detail === "string") {
        toast.error(detail);
      } else if (error.response?.status === 422) {
        toast.error("Ungültige Eingabe – bitte alle Felder prüfen");
      } else if (error.response?.status === 401) {
        toast.error("Nicht angemeldet – bitte neu einloggen");
      } else if (error.response?.status === 403) {
        toast.error("Keine Berechtigung zum Speichern");
      } else if (error.response?.status >= 500) {
        toast.error("Serverfehler – bitte später erneut versuchen");
      } else {
        toast.error("Fehler beim Speichern");
      }
    } finally {
      setSaving(false);
    }
  };

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
    <Layout>
      <div className="max-w-4xl mx-auto animate-fade-in" data-testid="recipe-form-page">
        {/* Back Button */}
        <Link 
          to={isEditing ? `/recipes/${id}` : "/recipes"} 
          className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-emerald-600 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEditing ? "Zurück zum Rezept" : "Zurück zu Rezepten"}
        </Link>

        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-8">
          {isEditing ? "Rezept bearbeiten" : "Neues Rezept"}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-6">
              Grundinformationen
            </h2>
            
            <div className="grid gap-6">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => updateField("name", e.target.value)}
                  placeholder="z.B. Spaghetti Bolognese"
                  className="input-field mt-1"
                  data-testid="recipe-name-input"
                />
              </div>

              <div>
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => updateField("description", e.target.value)}
                  placeholder="Kurze Beschreibung des Gerichts..."
                  className="mt-1"
                  rows={3}
                  data-testid="recipe-description-input"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Kategorie</Label>
                  <Select value={formData.category} onValueChange={v => updateField("category", v)}>
                    <SelectTrigger className="mt-1" data-testid="category-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.categories?.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Schwierigkeit</Label>
                  <Select value={formData.difficulty} onValueChange={v => updateField("difficulty", v)}>
                    <SelectTrigger className="mt-1" data-testid="difficulty-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.difficulties?.map(diff => (
                        <SelectItem key={diff} value={diff} className="capitalize">{diff}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="portions">Portionen</Label>
                  <Input
                    id="portions"
                    type="number"
                    min="1"
                    value={formData.portions}
                    onChange={e => updateField("portions", e.target.value === "" ? "" : parseInt(e.target.value) || 1)}
                    onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) updateField("portions", 1); }}
                    className="input-field mt-1"
                    data-testid="portions-input"
                  />
                </div>

                <div>
                  <Label htmlFor="cost">€ pro Portion</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_per_portion}
                    onChange={e => updateField("cost_per_portion", e.target.value)}
                    placeholder="2.50"
                    className="input-field mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="prep_time">Vorbereitungszeit (Min)</Label>
                  <Input
                    id="prep_time"
                    type="number"
                    min="0"
                    value={formData.prep_time}
                    onChange={e => updateField("prep_time", e.target.value)}
                    placeholder="15"
                    className="input-field mt-1"
                    data-testid="prep-time-input"
                  />
                </div>
                <div>
                  <Label htmlFor="cook_time">Kochzeit (Min)</Label>
                  <Input
                    id="cook_time"
                    type="number"
                    min="0"
                    value={formData.cook_time}
                    onChange={e => updateField("cook_time", e.target.value)}
                    placeholder="30"
                    className="input-field mt-1"
                    data-testid="cook-time-input"
                  />
                </div>
              </div>

              <div>
                <Label>Bilder</Label>
                {/* Existing + pending images gallery */}
                {(existingImages.length > 0 || pendingFiles.length > 0) && (
                  <div className="flex flex-wrap gap-3 mt-2 mb-3">
                    {existingImages.map((url, idx) => (
                      <div key={`ex-${idx}`} className="relative group w-24 h-24">
                        <img
                          src={url.startsWith("/api") ? `${API.replace("/api", "")}${url}` : url}
                          alt=""
                          className="w-24 h-24 rounded-lg object-cover border border-gray-200"
                          onError={e => e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect fill='%23f3f4f6' width='96' height='96'/%3E%3C/svg%3E"}
                        />
                        <button
                          type="button"
                          onClick={() => removeExistingImage(url)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {pendingFiles.map((file, idx) => (
                      <div key={`pend-${idx}`} className="relative group w-24 h-24">
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="w-24 h-24 rounded-lg object-cover border-2 border-dashed border-emerald-300"
                        />
                        <button
                          type="button"
                          onClick={() => removePendingFile(idx)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-0 left-0 right-0 bg-emerald-500 text-white text-[10px] text-center rounded-b-lg py-0.5">
                          Neu
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-gray-200 hover:border-emerald-300 rounded-xl p-6 text-center cursor-pointer transition-colors"
                  onClick={() => document.getElementById("image-file-input").click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-emerald-400", "bg-emerald-50"); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("border-emerald-400", "bg-emerald-50"); }}
                  onDrop={(e) => { e.currentTarget.classList.remove("border-emerald-400", "bg-emerald-50"); handleFileDrop(e); }}
                  data-testid="image-drop-zone"
                >
                  <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">
                    Bilder hierher ziehen oder <span className="text-emerald-600 font-medium">klicken</span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">JPEG, PNG, WebP (max 10 MB)</p>
                  <input
                    id="image-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="image-file-input"
                  />
                </div>
                {/* URL fallback */}
                <div className="mt-2">
                  <Input
                    value={formData.image_url}
                    onChange={e => updateField("image_url", e.target.value)}
                    placeholder="oder Bild-URL einfügen..."
                    className="input-field text-sm"
                    data-testid="image-url-input"
                  />
                </div>
              </div>

              {/* Mit Gruppe teilen */}
              {hasGroup && (
                <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">Mit Gruppe teilen</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        Alle Gruppenmitglieder können dieses Rezept sehen
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.shared_with_group}
                    onCheckedChange={(checked) => updateField("shared_with_group", checked)}
                    data-testid="share-with-group-switch"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Ingredients */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-6">
              Zutaten
            </h2>
            
            <div className="space-y-3">
              {formData.ingredients.map((ing, idx) => (
                <div key={idx} className="flex flex-wrap gap-2 items-start">
                  <IngredientNameInput
                    value={ing.name}
                    ingredientId={ing.ingredient_id}
                    onChange={(name, ingredientId) => updateIngredientName(idx, name, ingredientId)}
                    onCreateNew={handleCreateIngredient}
                    allIngredients={allIngredients}
                    idx={idx}
                  />
                  <div className="flex gap-2 items-start flex-1 sm:flex-none">
                    <Input
                      value={ing.amount}
                      onChange={e => updateIngredient(idx, "amount", e.target.value)}
                      placeholder="Menge"
                      className="w-20 sm:w-24 input-field"
                      data-testid={`ingredient-amount-${idx}`}
                    />
                    <Select value={ing.unit} onValueChange={v => updateIngredient(idx, "unit", v)}>
                      <SelectTrigger className="w-20" data-testid={`ingredient-unit-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="l">l</SelectItem>
                        <SelectItem value="Stück">Stück</SelectItem>
                        <SelectItem value="Stk">Stk</SelectItem>
                        <SelectItem value="EL">EL</SelectItem>
                        <SelectItem value="TL">TL</SelectItem>
                        <SelectItem value="Prise">Prise</SelectItem>
                        <SelectItem value="Msp.">Msp.</SelectItem>
                        <SelectItem value="Bund">Bund</SelectItem>
                        <SelectItem value="Pkg.">Pkg.</SelectItem>
                        <SelectItem value="Dose">Dose</SelectItem>
                        <SelectItem value="Flasche">Flasche</SelectItem>
                        <SelectItem value="Glas">Glas</SelectItem>
                        <SelectItem value="Scheibe">Scheibe</SelectItem>
                        <SelectItem value="Zehe">Zehe</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeIngredient(idx)}
                      disabled={formData.ingredients.length === 1}
                      className="text-red-500 hover:bg-red-50 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            <Button
              type="button"
              variant="outline"
              onClick={addIngredient}
              className="mt-4"
              data-testid="add-ingredient-button"
            >
              <Plus className="w-4 h-4 mr-2" /> Zutat hinzufügen
            </Button>
          </Card>

          {/* Instructions */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-6">
              Zubereitung
            </h2>
            
            <div className="space-y-3">
              {formData.instructions.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-medium text-sm mt-2">
                    {idx + 1}
                  </span>
                  <Textarea
                    value={step}
                    onChange={e => updateInstruction(idx, e.target.value)}
                    placeholder={`Schritt ${idx + 1}...`}
                    className="flex-1"
                    rows={2}
                    data-testid={`instruction-${idx}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeInstruction(idx)}
                    disabled={formData.instructions.length === 1}
                    className="text-red-500 hover:bg-red-50 mt-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button
              type="button"
              variant="outline"
              onClick={addInstruction}
              className="mt-4"
              data-testid="add-instruction-button"
            >
              <Plus className="w-4 h-4 mr-2" /> Schritt hinzufügen
            </Button>
          </Card>

          {/* Nutrition */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-6">
              Nährwerte (pro Portion)
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <Label>Kalorien (kcal)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.nutrition.calories ?? ""}
                  onChange={e => updateNutrition("calories", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
              <div>
                <Label>Protein (g)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.nutrition.protein ?? ""}
                  onChange={e => updateNutrition("protein", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
              <div>
                <Label>Kohlenhydrate (g)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.nutrition.carbs ?? ""}
                  onChange={e => updateNutrition("carbs", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
              <div>
                <Label>Fett (g)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.nutrition.fat ?? ""}
                  onChange={e => updateNutrition("fat", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
              <div>
                <Label>Ballaststoffe (g)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.nutrition.fiber ?? ""}
                  onChange={e => updateNutrition("fiber", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
            </div>
          </Card>

          {/* Beilagen */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Beilagen
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Verknüpfe andere Rezepte als Beilage zu diesem Gericht.
            </p>

            {/* Selected side dishes */}
            {formData.side_dishes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {formData.side_dishes.map(sid => {
                  const r = allRecipes.find(r => r.recipe_id === sid);
                  if (!r) return null;
                  return (
                    <div
                      key={sid}
                      className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl pl-3 pr-2 py-1.5"
                    >
                      {r.image_url && (
                        <img src={r.image_url} alt={r.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-emerald-800">{r.name}</span>
                      <span className="text-xs text-emerald-600 bg-emerald-100 rounded-full px-1.5 py-0.5">{r.category}</span>
                      <button
                        type="button"
                        onClick={() => updateField("side_dishes", formData.side_dishes.filter(x => x !== sid))}
                        className="ml-1 w-5 h-5 rounded-full hover:bg-emerald-200 flex items-center justify-center text-emerald-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search & add */}
            <div className="relative">
              <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400 bg-white">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Rezept suchen und hinzufügen…"
                  value={sideDishSearch}
                  onChange={e => { setSideDishSearch(e.target.value); setShowSideDishDropdown(true); }}
                  onFocus={() => setShowSideDishDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSideDishDropdown(false), 200)}
                  className="flex-1 text-sm outline-none bg-transparent text-[var(--text-primary)] placeholder:text-gray-400"
                />
              </div>

              {showSideDishDropdown && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {allRecipes
                    .filter(r =>
                      r.recipe_id !== id &&
                      !formData.side_dishes.includes(r.recipe_id) &&
                      (sideDishSearch === "" || r.name.toLowerCase().includes(sideDishSearch.toLowerCase()))
                    )
                    .slice(0, 8)
                    .map(r => (
                      <button
                        key={r.recipe_id}
                        type="button"
                        onMouseDown={() => {
                          updateField("side_dishes", [...formData.side_dishes, r.recipe_id]);
                          setSideDishSearch("");
                          setShowSideDishDropdown(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
                      >
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 text-sm">🍽️</div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{r.category}</p>
                        </div>
                        <Plus className="w-4 h-4 text-emerald-500 flex-shrink-0 ml-auto" />
                      </button>
                    ))}
                  {allRecipes.filter(r =>
                    r.recipe_id !== id &&
                    !formData.side_dishes.includes(r.recipe_id) &&
                    (sideDishSearch === "" || r.name.toLowerCase().includes(sideDishSearch.toLowerCase()))
                  ).length === 0 && (
                    <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">
                      Keine Rezepte gefunden
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Allergens */}
          <Card className="p-6 bg-white border-gray-100">
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-6">
              Allergene
            </h2>
            
            <div className="flex flex-wrap gap-4">
              {categories.allergens?.map(allergen => (
                <label 
                  key={allergen} 
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={formData.allergens.includes(allergen)}
                    onCheckedChange={() => toggleAllergen(allergen)}
                    data-testid={`allergen-${allergen}`}
                  />
                  <span className="text-[var(--text-primary)]">{allergen}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link to={isEditing ? `/recipes/${id}` : "/recipes"}>
              <Button type="button" variant="outline">
                Abbrechen
              </Button>
            </Link>
            <Button 
              type="submit" 
              className="btn-primary"
              disabled={saving}
              data-testid="save-recipe-button"
            >
              <Save className="w-4 h-4" />
              {saving ? "Wird gespeichert..." : (isEditing ? "Speichern" : "Rezept erstellen")}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default RecipeForm;
