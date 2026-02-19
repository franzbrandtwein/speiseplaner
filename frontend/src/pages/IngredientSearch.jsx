import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { 
  Search, Plus, X, ChefHat, Clock, Users, Star, 
  CheckCircle, AlertCircle, Sparkles 
} from "lucide-react";

const IngredientSearch = () => {
  const [ingredients, setIngredients] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const addIngredient = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !ingredients.includes(trimmed.toLowerCase())) {
      setIngredients([...ingredients, trimmed.toLowerCase()]);
      setInputValue("");
    }
  };

  const removeIngredient = (ing) => {
    setIngredients(ingredients.filter(i => i !== ing));
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addIngredient();
    }
  };

  const searchRecipes = async () => {
    if (ingredients.length === 0) {
      toast.error("Füge mindestens eine Zutat hinzu");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/recipes/search-by-ingredients`,
        { ingredients },
        { withCredentials: true }
      );
      setResults(response.data);
      
      if (response.data.recipes.length === 0) {
        toast.info("Keine passenden Rezepte gefunden");
      } else {
        toast.success(`${response.data.total_found} Rezepte gefunden!`);
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Fehler bei der Suche");
    } finally {
      setLoading(false);
    }
  };

  const quickIngredients = [
    "Tomaten", "Zwiebeln", "Knoblauch", "Kartoffeln", "Reis", 
    "Nudeln", "Hähnchen", "Eier", "Käse", "Milch", "Butter",
    "Paprika", "Karotten", "Salat", "Brot"
  ];

  const addQuickIngredient = (ing) => {
    const lower = ing.toLowerCase();
    if (!ingredients.includes(lower)) {
      setIngredients([...ingredients, lower]);
    }
  };

  return (
    <Layout>
      <div className="animate-fade-in max-w-4xl mx-auto" data-testid="ingredient-search-page">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-2">
            Was kann ich kochen?
          </h1>
          <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
            Gib die Zutaten ein, die du hast, und finde passende Rezepte. 
            Reduziere Food-Waste und entdecke neue Gerichte!
          </p>
        </div>

        {/* Input Section */}
        <Card className="p-6 bg-white border-gray-100 mb-6">
          <div className="flex gap-2 mb-4">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Zutat eingeben (z.B. Tomaten)"
              className="input-field flex-1"
              data-testid="ingredient-input"
            />
            <Button 
              type="button" 
              onClick={addIngredient}
              className="btn-secondary"
              data-testid="add-ingredient-button"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>

          {/* Quick Add Ingredients */}
          <div className="mb-4">
            <p className="text-sm text-[var(--text-muted)] mb-2">Schnell hinzufügen:</p>
            <div className="flex flex-wrap gap-2">
              {quickIngredients.map(ing => (
                <button
                  key={ing}
                  onClick={() => addQuickIngredient(ing)}
                  disabled={ingredients.includes(ing.toLowerCase())}
                  className={`px-3 py-1 rounded-full text-sm transition-all ${
                    ingredients.includes(ing.toLowerCase())
                      ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
                      : "bg-gray-100 text-[var(--text-secondary)] hover:bg-emerald-50 hover:text-emerald-600"
                  }`}
                  data-testid={`quick-ingredient-${ing}`}
                >
                  {ing}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Ingredients */}
          {ingredients.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-[var(--text-muted)] mb-2">
                Deine Zutaten ({ingredients.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {ingredients.map(ing => (
                  <Badge 
                    key={ing}
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1 text-sm flex items-center gap-1"
                  >
                    {ing}
                    <button
                      onClick={() => removeIngredient(ing)}
                      className="ml-1 hover:text-red-500"
                      data-testid={`remove-${ing}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search Button */}
          <Button
            onClick={searchRecipes}
            disabled={loading || ingredients.length === 0}
            className="w-full btn-primary"
            data-testid="search-recipes-button"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Suche...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Rezepte finden
              </>
            )}
          </Button>
        </Card>

        {/* Results */}
        {results && (
          <div className="space-y-4" data-testid="search-results">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                {results.total_found} Rezepte gefunden
              </h2>
              {results.total_found > 0 && (
                <p className="text-sm text-[var(--text-muted)]">
                  Sortiert nach Übereinstimmung
                </p>
              )}
            </div>

            {results.recipes.length === 0 ? (
              <Card className="p-8 bg-white border-gray-100 text-center">
                <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
                  Keine passenden Rezepte
                </h3>
                <p className="text-[var(--text-muted)] mb-4">
                  Versuche mehr Zutaten hinzuzufügen oder erstelle ein neues Rezept.
                </p>
                <Link to="/recipes/new">
                  <Button className="btn-primary">
                    <Plus className="w-4 h-4" /> Neues Rezept erstellen
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="grid gap-4">
                {results.recipes.map(recipe => (
                  <RecipeResultCard key={recipe.recipe_id} recipe={recipe} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

const RecipeResultCard = ({ recipe }) => {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  
  return (
    <Link to={`/recipes/${recipe.recipe_id}`} data-testid={`result-${recipe.recipe_id}`}>
      <Card className="p-4 bg-white border-gray-100 hover:border-emerald-200 hover:shadow-lg transition-all flex gap-4">
        {/* Image */}
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
          {recipe.image_url ? (
            <img 
              src={recipe.image_url} 
              alt={recipe.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ChefHat className="w-8 h-8 text-gray-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] line-clamp-1">
                {recipe.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                  {recipe.category}
                </span>
                {recipe.avg_rating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {recipe.avg_rating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Match Percentage */}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              recipe.match_percentage >= 80 
                ? "bg-emerald-100 text-emerald-700" 
                : recipe.match_percentage >= 50 
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}>
              {recipe.match_percentage}% Match
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] mb-3">
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
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              {recipe.matching_count}/{recipe.total_ingredients} Zutaten
            </div>
          </div>

          {/* Missing Ingredients */}
          {recipe.missing_ingredients.length > 0 && (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[var(--text-muted)] line-clamp-1">
                Fehlt: {recipe.missing_ingredients.slice(0, 3).join(", ")}
                {recipe.missing_ingredients.length > 3 && ` +${recipe.missing_ingredients.length - 3} mehr`}
              </p>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
};

export default IngredientSearch;
