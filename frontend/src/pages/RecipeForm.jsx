import { useState, useEffect } from "react";
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
import { ArrowLeft, Plus, Trash2, Save, Image, Users } from "lucide-react";

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
    ingredients: [{ name: "", amount: "", unit: "g" }],
    instructions: [""],
    nutrition: {
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
      fiber: ""
    },
    allergens: [],
    shared_with_group: false
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, groupRes] = await Promise.all([
          axios.get(`${API}/categories`, { withCredentials: true }),
          axios.get(`${API}/groups/my`, { withCredentials: true })
        ]);
        setCategories(catRes.data);
        setHasGroup(groupRes.data.group !== null);
        
        if (isEditing) {
          const recipeRes = await axios.get(`${API}/recipes/${id}`, { withCredentials: true });
          const recipe = recipeRes.data;
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

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    updateField("ingredients", newIngredients);
  };

  const addIngredient = () => {
    updateField("ingredients", [...formData.ingredients, { name: "", amount: "", unit: "g" }]);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Bitte gib einen Namen ein");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        prep_time: formData.prep_time ? parseInt(formData.prep_time) : null,
        cook_time: formData.cook_time ? parseInt(formData.cook_time) : null,
        cost_per_portion: formData.cost_per_portion ? parseFloat(formData.cost_per_portion) : null,
        ingredients: formData.ingredients.filter(i => i.name.trim()),
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
        toast.success("Rezept aktualisiert");
      } else {
        const response = await axios.post(`${API}/recipes`, payload, { withCredentials: true });
        toast.success("Rezept erstellt");
        navigate(`/recipes/${response.data.recipe_id}`);
        return;
      }
      navigate(`/recipes/${id}`);
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Fehler beim Speichern");
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
                    onChange={e => updateField("portions", parseInt(e.target.value) || 1)}
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
                <Label htmlFor="image_url">Bild-URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={e => updateField("image_url", e.target.value)}
                    placeholder="https://..."
                    className="input-field flex-1"
                    data-testid="image-url-input"
                  />
                  <Button type="button" variant="outline" className="shrink-0">
                    <Image className="w-4 h-4" />
                  </Button>
                </div>
                {formData.image_url && (
                  <img 
                    src={formData.image_url} 
                    alt="Preview" 
                    className="mt-2 h-32 w-auto rounded-lg object-cover"
                    onError={e => e.target.style.display = 'none'}
                  />
                )}
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
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    value={ing.name}
                    onChange={e => updateIngredient(idx, "name", e.target.value)}
                    placeholder="Zutat"
                    className="flex-1 input-field"
                    data-testid={`ingredient-name-${idx}`}
                  />
                  <Input
                    value={ing.amount}
                    onChange={e => updateIngredient(idx, "amount", e.target.value)}
                    placeholder="Menge"
                    className="w-24 input-field"
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
                      <SelectItem value="Stk">Stk</SelectItem>
                      <SelectItem value="EL">EL</SelectItem>
                      <SelectItem value="TL">TL</SelectItem>
                      <SelectItem value="Prise">Prise</SelectItem>
                      <SelectItem value="Bund">Bund</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeIngredient(idx)}
                    disabled={formData.ingredients.length === 1}
                    className="text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
                  value={formData.nutrition.calories}
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
                  value={formData.nutrition.protein}
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
                  value={formData.nutrition.carbs}
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
                  value={formData.nutrition.fat}
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
                  value={formData.nutrition.fiber}
                  onChange={e => updateNutrition("fiber", e.target.value)}
                  className="input-field mt-1"
                />
              </div>
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
