import { useState } from "react";
import axios from "axios";
import { API } from "../App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Download, Loader2, ChefHat, Clock, Users, AlertCircle,
  CheckCircle2, ExternalLink, X, Edit2
} from "lucide-react";
import { toast } from "sonner";

// Supported recipe sites
const SUPPORTED_SITES = [
  { name: "REWE", url: "rewe.de/rezepte/", logo: "🛒" },
  { name: "KitchenStories", url: "kitchenstories.com/de/rezepte/", logo: "🍳" },
  { name: "Chefkoch", url: "chefkoch.de/rezepte/", logo: "👨‍🍳" },
  { name: "Lecker.de", url: "lecker.de/", logo: "🍽️" },
  { name: "Eat Smarter", url: "eat-smarter.de/", logo: "🥗" },
  { name: "Springlane", url: "springlane.de/magazin/rezeptwelt/", logo: "🌿" },
];

// Preview card for an imported recipe
const RecipePreview = ({ recipe, onSave, onEdit, saving }) => {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  return (
    <div className="space-y-4">
      {/* Image + Header */}
      <div className="rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="w-full h-40 object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div className="p-4">
          <h3 className="font-semibold text-lg text-gray-900">{recipe.name}</h3>
          {recipe.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{recipe.description}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-3">
            {totalTime > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <Clock className="w-3.5 h-3.5" /> {totalTime} Min
              </span>
            )}
            {recipe.portions && (
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <Users className="w-3.5 h-3.5" /> {recipe.portions} Portionen
              </span>
            )}
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
              {recipe.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              recipe.difficulty === 'leicht' ? 'bg-green-50 text-green-700' :
              recipe.difficulty === 'schwer' ? 'bg-red-50 text-red-700' :
              'bg-yellow-50 text-yellow-700'
            }`}>
              {recipe.difficulty}
            </span>
          </div>
        </div>
      </div>

      {/* Ingredients preview */}
      {recipe.ingredients?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Zutaten ({recipe.ingredients.length})
          </p>
          <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
            {recipe.ingredients.map((ing, i) => (
              <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                <span className="font-medium">{ing.amount} {ing.unit}</span> {ing.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions preview */}
      {recipe.instructions?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Zubereitung ({recipe.instructions.length} Schritte)
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {recipe.instructions.slice(0, 3).map((step, i) => (
              <div key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="line-clamp-2">{step}</span>
              </div>
            ))}
            {recipe.instructions.length > 3 && (
              <p className="text-xs text-gray-400 pl-7">
                + {recipe.instructions.length - 3} weitere Schritte…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Nutrition */}
      {recipe.nutrition?.calories && (
        <div className="flex gap-3 text-xs text-gray-600 bg-blue-50 rounded-lg p-2">
          <span>🔥 {recipe.nutrition.calories} kcal</span>
          {recipe.nutrition.protein && <span>💪 {recipe.nutrition.protein}g Protein</span>}
          {recipe.nutrition.carbs && <span>🌾 {recipe.nutrition.carbs}g Kohlenhydrate</span>}
          {recipe.nutrition.fat && <span>🫒 {recipe.nutrition.fat}g Fett</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={onSave}
          disabled={saving}
          className="flex-1 btn-primary"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichern…</>
          ) : (
            <><CheckCircle2 className="w-4 h-4 mr-2" /> Rezept speichern</>
          )}
        </Button>
        <Button onClick={onEdit} variant="outline" className="gap-1.5">
          <Edit2 className="w-4 h-4" />
          Bearbeiten
        </Button>
      </div>
    </div>
  );
};

const RecipeImportDialog = ({ open, onClose, onImported }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const res = await axios.post(
        `${API}/recipes/import-preview`,
        { url: url.trim() },
        { withCredentials: true }
      );
      setPreview(res.data.recipe);
    } catch (err) {
      const msg = err.response?.data?.detail || "Fehler beim Laden des Rezepts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await axios.post(`${API}/recipes/import-save`, preview, { withCredentials: true });
      toast.success(`"${preview.name}" erfolgreich importiert!`);
      onImported?.();
      handleClose();
    } catch (err) {
      const msg = err.response?.data?.detail || "Fehler beim Speichern";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    // Navigate to recipe form with prefilled data
    if (preview) {
      // Store in sessionStorage and redirect
      sessionStorage.setItem('import_recipe_draft', JSON.stringify(preview));
      onImported?.('edit');
      handleClose();
    }
  };

  const handleClose = () => {
    setUrl("");
    setError("");
    setPreview(null);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleFetch();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Download className="w-5 h-5 text-emerald-500" />
            Rezept importieren
          </DialogTitle>
          <DialogDescription>
            Füge eine URL ein und das Rezept wird automatisch erkannt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* URL Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="https://www.rewe.de/rezepte/spaghetti-carbonara/"
                className="flex-1 text-sm"
                disabled={loading}
              />
              <Button
                onClick={handleFetch}
                disabled={!url.trim() || loading}
                className="btn-primary flex-shrink-0"
                type="button"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Supported sites */}
          {!preview && !loading && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Unterstützte Seiten:</p>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_SITES.map((site) => (
                  <div
                    key={site.name}
                    className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 rounded-lg px-2 py-1.5 transition-colors cursor-default"
                  >
                    <span>{site.logo}</span>
                    <span className="font-medium">{site.name}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 text-xs text-gray-400 px-1">
                  <span>+ alle Seiten mit Schema.org Rezeptdaten</span>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Rezept wird geladen und analysiert…</p>
            </div>
          )}

          {/* Preview */}
          {preview && !loading && (
            <RecipePreview
              recipe={preview}
              onSave={handleSave}
              onEdit={handleEdit}
              saving={saving}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeImportDialog;
