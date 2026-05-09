import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { 
  ChefHat, Clock, Users, Star, ArrowLeft, Edit, Trash2, 
  AlertTriangle, DollarSign, Flame, UtensilsCrossed, Upload, X, ChevronLeft, ChevronRight,
  Database, ShoppingBag, Sparkles, ChevronDown, ChevronUp
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

const hasCompleteNutrition = (recipe) => {
  const n = recipe?.nutrition;
  if (!n) return false;
  return ["calories", "protein", "fat", "carbs"].every(k => n[k] != null);
};

const RecipeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingText, setRatingText] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [hoverStars, setHoverStars] = useState(0);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [nutrition, setNutrition] = useState(null);
  const [nutritionView, setNutritionView] = useState("portion");
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [estimatingNutrition, setEstimatingNutrition] = useState(false);
  const [showEstimatePanel, setShowEstimatePanel] = useState(false);
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiUsage, setGeminiUsage] = useState({});
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchGeminiModels = useCallback(async () => {
    try {
      const [modelsRes, usageRes] = await Promise.all([
        axios.get(`${API}/recipes/gemini-models`, { withCredentials: true }),
        axios.get(`${API}/recipes/gemini-usage`, { withCredentials: true }),
      ]);
      const models = modelsRes.data.models || [];
      setGeminiModels(models);
      setGeminiUsage(usageRes.data || {});
      if (models.length > 0) setSelectedModel(prev => prev || models[0].id);
    } catch {
      setGeminiModels([]);
    }
  }, []);

  const handleEstimateNutrition = async () => {
    setEstimatingNutrition(true);
    try {
      await axios.post(
        `${API}/recipes/${id}/estimate-nutrition?model=${encodeURIComponent(selectedModel)}`,
        {},
        { withCredentials: true }
      );
      const resp = await axios.get(`${API}/recipes/${id}`, { withCredentials: true });
      setRecipe(resp.data);
      axios.get(`${API}/recipes/gemini-usage`, { withCredentials: true })
        .then(r => setGeminiUsage(r.data || {})).catch(() => {});
      toast.success("Nährwerte wurden geschätzt");
      setShowEstimatePanel(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Schätzung fehlgeschlagen");
    } finally {
      setEstimatingNutrition(false);
    }
  };

  const fetchNutrition = useCallback(async (recipeId) => {
    setNutritionLoading(true);
    try {
      const { data } = await axios.get(`${API}/recipes/${recipeId}/nutrition`, { withCredentials: true });
      if (data.total?.calories != null) setNutrition(data);
    } catch {
      // Keine Nährwerte → still ignorieren
    } finally {
      setNutritionLoading(false);
    }
  }, []);

  const fetchRecipe = async () => {
    try {
      const response = await axios.get(`${API}/recipes/${id}`, { withCredentials: true });
      setRecipe(response.data);
      fetchNutrition(id);
      
      const myRating = response.data.ratings?.find(r => r.user_id === user?.user_id);
      if (myRating) {
        setRatingStars(myRating.stars);
        setRatingText(myRating.text || "");
      }
    } catch (error) {
      console.error("Error fetching recipe:", error);
      toast.error("Rezept konnte nicht geladen werden");
      navigate("/recipes");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/recipes/${id}`, { withCredentials: true });
      toast.success("Rezept gelöscht");
      navigate("/recipes");
    } catch (error) {
      toast.error("Fehler beim Löschen");
    }
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0) {
      toast.error("Bitte wähle eine Bewertung");
      return;
    }
    
    setSubmittingRating(true);
    try {
      await axios.post(
        `${API}/recipes/${id}/ratings`,
        { stars: ratingStars, text: ratingText },
        { withCredentials: true }
      );
      toast.success("Bewertung gespeichert");
      fetchRecipe();
    } catch (error) {
      toast.error("Fehler beim Speichern");
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleUploadImage = async (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    setUploadingImage(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await axios.post(`${API}/recipes/${id}/images`, fd, { withCredentials: true });
      }
      toast.success(files.length > 1 ? `${files.length} Bilder hochgeladen` : "Bild hochgeladen");
      fetchRecipe();
    } catch {
      toast.error("Fehler beim Hochladen");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async (imageUrl) => {
    try {
      await axios.delete(`${API}/recipes/${id}/images`, {
        data: { image_url: imageUrl }, withCredentials: true
      });
      toast.success("Bild entfernt");
      fetchRecipe();
      setGalleryIdx(0);
    } catch {
      toast.error("Fehler beim Entfernen");
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

  if (!recipe) return null;

  const isOwner = recipe.user_id === user?.user_id;
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  const images = recipe.images?.length > 0 ? recipe.images : (recipe.image_url ? [recipe.image_url] : []);
  const resolveImgSrc = (url) => url?.startsWith("/api") ? `${API.replace("/api", "")}${url}` : url;

  return (
    <Layout>
      <div className="animate-fade-in" data-testid="recipe-detail-page">
        {/* Back Button */}
        <Link to="/recipes" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-emerald-600 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zu Rezepten
        </Link>

        {/* Image Gallery */}
        {images.length > 0 ? (
          <div className="relative aspect-[21/9] rounded-2xl overflow-hidden mb-8 bg-gray-100 group" data-testid="image-gallery">
            <img 
              src={resolveImgSrc(images[galleryIdx])} 
              alt={recipe.name}
              className="w-full h-full object-cover"
              onError={e => e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect fill='%23f3f4f6' width='800' height='400'/%3E%3Ctext x='400' y='200' text-anchor='middle' fill='%239ca3af' font-size='20'%3EBild nicht verfügbar%3C/text%3E%3C/svg%3E"}
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setGalleryIdx(i => (i - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setGalleryIdx(i => (i + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setGalleryIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === galleryIdx ? "bg-white w-6" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
            {isOwner && (
              <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDeleteImage(images[galleryIdx])}
                  className="w-8 h-8 bg-red-500/80 hover:bg-red-600 text-white rounded-lg flex items-center justify-center"
                  title="Bild entfernen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : isOwner ? (
          <div
            className="aspect-[21/9] rounded-2xl mb-8 bg-gray-50 border-2 border-dashed border-gray-200 hover:border-emerald-300 flex flex-col items-center justify-center cursor-pointer transition-colors"
            onClick={() => document.getElementById("detail-image-upload").click()}
            data-testid="image-upload-placeholder"
          >
            <Upload className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-[var(--text-muted)]">Bilder hochladen</p>
            <input id="detail-image-upload" type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImage} />
          </div>
        ) : null}

        {/* Thumbnail strip + Add button (for owner with existing images) */}
        {isOwner && images.length > 0 && (
          <div className="flex items-center gap-2 mb-6 -mt-4">
            {images.map((url, i) => (
              <button key={i} onClick={() => setGalleryIdx(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === galleryIdx ? "border-emerald-500 ring-1 ring-emerald-300" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                <img src={resolveImgSrc(url)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            <label className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-200 hover:border-emerald-300 flex items-center justify-center cursor-pointer transition-colors">
              {uploadingImage ? (
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4 text-gray-400" />
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImage} data-testid="detail-add-image-btn" />
            </label>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                  {recipe.category}
                </span>
                <span className="capitalize px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  {recipe.difficulty}
                </span>
                {recipe.is_pickup && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Abholung
                  </span>
                )}
              </div>
              
              <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-4">
                {recipe.name}
              </h1>
              
              {recipe.description && (
                <p className="text-lg text-[var(--text-secondary)]">{recipe.description}</p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-6 mt-6 py-4 border-y border-gray-100">
                {totalTime > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Gesamtzeit</p>
                      <p className="font-medium">{totalTime} Min</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Portionen</p>
                    <p className="font-medium">{recipe.portions}</p>
                  </div>
                </div>
                {recipe.avg_rating > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Bewertung</p>
                      <p className="font-medium">{recipe.avg_rating.toFixed(1)} ({recipe.rating_count})</p>
                    </div>
                  </div>
                )}
                {recipe.cost_per_portion && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Pro Portion</p>
                      <p className="font-medium">€{recipe.cost_per_portion.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6 flex-wrap">
                <Link to={`/recipes/${id}/print`}>
                  <Button variant="outline" className="btn-secondary" data-testid="print-recipe-button">
                    <ChefHat className="w-4 h-4" /> Kochansicht
                  </Button>
                </Link>
                {isOwner && (
                  <>
                    <Link to={`/recipes/${id}/edit`}>
                      <Button className="btn-secondary" data-testid="edit-recipe-button">
                        <Edit className="w-4 h-4" /> Bearbeiten
                      </Button>
                    </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" data-testid="delete-recipe-button">
                        <Trash2 className="w-4 h-4" /> Löschen
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rezept löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Diese Aktion kann nicht rückgängig gemacht werden. Das Rezept wird dauerhaft gelöscht.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  </>
                )}
              </div>
            </div>

            {/* Instructions */}
            {!recipe.is_pickup && <Card className="p-6 bg-white border-gray-100">
              <h2 className="font-heading text-2xl font-semibold text-[var(--text-primary)] mb-6">
                Zubereitung
              </h2>
              {recipe.instructions?.length > 0 ? (
                <ol className="space-y-4">
                  {recipe.instructions.map((step, idx) => (
                    <li key={idx} className="flex gap-4">
                      <span className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-medium">
                        {idx + 1}
                      </span>
                      <p className="text-[var(--text-primary)] pt-1">{step}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[var(--text-muted)]">Keine Zubereitungsschritte angegeben</p>
              )}
            </Card>}

            {/* Ratings Section */}
            <Card className="p-6 bg-white border-gray-100" data-testid="ratings-section">
              <h2 className="font-heading text-2xl font-semibold text-[var(--text-primary)] mb-6">
                Bewertungen
              </h2>
              
              {/* Add Rating */}
              <div className="mb-8 p-4 bg-[var(--bg-subtle)] rounded-xl">
                <h3 className="font-medium text-[var(--text-primary)] mb-3">Deine Bewertung</h3>
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRatingStars(star)}
                      onMouseEnter={() => setHoverStars(star)}
                      onMouseLeave={() => setHoverStars(0)}
                      className="p-1 transition-transform hover:scale-110"
                      data-testid={`rating-star-${star}`}
                    >
                      <Star 
                        className={`w-8 h-8 ${
                          star <= (hoverStars || ratingStars)
                            ? "text-amber-500 fill-amber-500"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Schreibe einen Kommentar (optional)..."
                  value={ratingText}
                  onChange={e => setRatingText(e.target.value)}
                  className="mb-4"
                  data-testid="rating-text"
                />
                <Button 
                  onClick={handleSubmitRating} 
                  disabled={submittingRating || ratingStars === 0}
                  className="btn-primary"
                  data-testid="submit-rating-button"
                >
                  {submittingRating ? "Wird gespeichert..." : "Bewertung speichern"}
                </Button>
              </div>

              {/* Ratings List */}
              {recipe.ratings?.length > 0 ? (
                <div className="space-y-4">
                  {recipe.ratings.map(rating => (
                    <div key={rating.rating_id} className="p-4 border border-gray-100 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-[var(--text-primary)]">{rating.user_name}</p>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i}
                              className={`w-4 h-4 ${
                                i < rating.stars ? "text-amber-500 fill-amber-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {rating.text && (
                        <p className="text-[var(--text-secondary)]">{rating.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-center py-4">
                  Noch keine Bewertungen. Sei der Erste!
                </p>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ingredients / Bezugsquelle */}
            <Card className="p-6 bg-white border-gray-100 sticky top-6 z-10" data-testid="ingredients-section">
              {recipe.is_pickup ? (
                <div className="flex flex-col gap-3">
                  <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    Bezugsquelle
                  </h2>
                  {recipe.pickup_source ? (
                    <p className="text-[var(--text-primary)] font-medium">{recipe.pickup_source}</p>
                  ) : (
                    <p className="text-[var(--text-muted)] text-sm">Keine Bezugsquelle hinterlegt</p>
                  )}
                </div>
              ) : (
                <>
                  <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-4">
                    Zutaten
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    für {recipe.portions} Portionen
                  </p>
                  
                  {recipe.ingredients?.length > 0 ? (
                    <ul className="space-y-3">
                      {recipe.ingredients.map((ing, idx) => (
                        <li key={idx} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-[var(--text-primary)]">{ing.name}</span>
                          <span className="text-[var(--text-secondary)] font-mono text-sm">
                            {ing.amount} {ing.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--text-muted)]">Keine Zutaten angegeben</p>
                  )}
                </>
              )}
            </Card>

            {/* Nutrition – berechnet aus Stammdaten oder KI-Schätzung */}
            {(nutrition || nutritionLoading || recipe?.nutrition?.estimated) && (
              <Card className="p-6 bg-white border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-500" />
                    Nährwerte
                    {recipe?.nutrition?.estimated && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                        <Sparkles className="w-3 h-3" /> KI-Schätzung
                      </span>
                    )}
                  </h2>
                  {nutrition && (
                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-sm">
                      <button
                        onClick={() => setNutritionView("portion")}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${nutritionView === "portion" ? "bg-white shadow-sm text-emerald-700" : "text-gray-500"}`}
                      >
                        Pro Portion
                      </button>
                      <button
                        onClick={() => setNutritionView("total")}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${nutritionView === "total" ? "bg-white shadow-sm text-emerald-700" : "text-gray-500"}`}
                      >
                        Gesamt
                      </button>
                    </div>
                  )}
                </div>

                {/* KI-Schätzung direkt anzeigen wenn keine Stammdaten-Nährwerte */}
                {recipe?.nutrition?.estimated && !nutrition && (() => {
                  const n = recipe.nutrition;
                  const fields = [
                    { key: "calories", label: "Kalorien", unit: "kcal", color: "bg-orange-50 text-orange-700 border-orange-200" },
                    { key: "protein", label: "Protein", unit: "g", color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { key: "fat", label: "Fett", unit: "g", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { key: "saturated_fat", label: "ges. Fett", unit: "g", color: "bg-yellow-50 text-yellow-600 border-yellow-100" },
                    { key: "carbs", label: "Kohlenhydr.", unit: "g", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    { key: "sugar", label: "Zucker", unit: "g", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                    { key: "fiber", label: "Ballaststoffe", unit: "g", color: "bg-green-50 text-green-700 border-green-200" },
                    { key: "salt", label: "Salz", unit: "g", color: "bg-gray-50 text-gray-600 border-gray-200" },
                  ];
                  return (
                    <div className="grid grid-cols-4 gap-2">
                      {fields.map(f => n[f.key] != null ? (
                        <div key={f.key} className={`rounded-xl border p-3 text-center ${f.color}`}>
                          <div className="text-lg font-bold">{n[f.key]}</div>
                          <div className="text-xs opacity-70">{f.unit}</div>
                          <div className="text-[11px] mt-0.5 leading-tight">{f.label}</div>
                        </div>
                      ) : null)}
                    </div>
                  );
                })()}

                {nutritionLoading && <p className="text-sm text-gray-400">Berechne …</p>}
                {nutrition && (() => {
                  const n = nutritionView === "portion" ? nutrition.per_portion : nutrition.total;
                  const fields = [
                    { key: "calories", label: "Kalorien", unit: "kcal", color: "bg-orange-50 text-orange-700 border-orange-200" },
                    { key: "protein", label: "Protein", unit: "g", color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { key: "fat", label: "Fett", unit: "g", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { key: "saturated_fat", label: "ges. Fett", unit: "g", color: "bg-yellow-50 text-yellow-600 border-yellow-100" },
                    { key: "carbs", label: "Kohlenhydr.", unit: "g", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    { key: "sugar", label: "Zucker", unit: "g", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                    { key: "fiber", label: "Ballaststoffe", unit: "g", color: "bg-green-50 text-green-700 border-green-200" },
                    { key: "salt", label: "Salz", unit: "g", color: "bg-gray-50 text-gray-600 border-gray-200" },
                  ];
                  return (
                    <>
                      <div className="grid grid-cols-4 gap-2">
                        {fields.map(f => n[f.key] != null ? (
                          <div key={f.key} className={`rounded-xl border p-3 text-center ${f.color}`}>
                            <div className="text-lg font-bold">{n[f.key]}</div>
                            <div className="text-xs opacity-70">{f.unit}</div>
                            <div className="text-[11px] mt-0.5 leading-tight">{f.label}</div>
                          </div>
                        ) : null)}
                      </div>
                      {nutrition.missing?.length > 0 && (
                        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          Keine Stammdaten für: {nutrition.missing.join(", ")}
                        </p>
                      )}
                    </>
                  );
                })()}
              </Card>
            )}

            {/* Nährwerte schätzen (wenn keine oder unvollständige vorhanden) */}
            {!nutritionLoading && !nutrition && !hasCompleteNutrition(recipe) && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-violet-600 border-violet-200 hover:bg-violet-50 w-full"
                  onClick={() => {
                    setShowEstimatePanel(p => {
                      if (!p) fetchGeminiModels();
                      return !p;
                    });
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Nährwerte via KI schätzen
                  {showEstimatePanel ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                </Button>

                {showEstimatePanel && (
                  <div className="mt-3 p-4 rounded-xl border border-violet-200 bg-violet-50 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-violet-700 mb-1">Gemini-Modell</label>
                      {geminiModels.length > 0 ? (
                        <>
                          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={estimatingNutrition}>
                            <SelectTrigger className="bg-white border-violet-200 h-8 text-sm">
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
                              { label: "Token/min", used: usage.tpm || 0, limit: m.limits.tpm, fmt: v => `${(v/1000).toLocaleString()}k`, note: !(usage.tpm > 0) },
                            ];
                            return (
                              <div className="mt-2 space-y-1.5">
                                {bars.map(({ label, used, limit, fmt, note }) => {
                                  const pct = Math.min(isFinite(used) ? (used / limit) * 100 : 100, 100);
                                  const color = pct >= 100 ? "bg-red-500" : pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-violet-500";
                                  const displayUsed = note ? "–" : !isFinite(used) ? "≥"+fmt(limit) : fmt(used);
                                  return (
                                    <div key={label} className="flex items-center gap-2">
                                      <span className="text-xs text-violet-500 w-14 shrink-0">{label}</span>
                                      <div className="flex-1 bg-violet-200 rounded-full h-1.5">
                                        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className={`text-xs whitespace-nowrap w-20 text-right ${!isFinite(used) ? "text-red-600 font-medium" : "text-violet-600"}`}>
                                        {displayUsed} / {fmt(limit)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-xs text-violet-500 italic">Lade Modelle…</p>
                      )}
                    </div>
                    <Button
                      className="bg-violet-600 hover:bg-violet-700 text-white w-full"
                      size="sm"
                      onClick={handleEstimateNutrition}
                      disabled={estimatingNutrition || !selectedModel}
                    >
                      {estimatingNutrition
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Schätze…</>
                        : <><Sparkles className="w-3.5 h-3.5 mr-2" />Schätzen starten</>
                      }
                    </Button>
                  </div>
                )}
              </div>
            )}


            {/* Allergens */}
            {recipe.allergens?.length > 0 && (
              <Card className="p-6 bg-amber-50 border-amber-200">
                <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Allergene
                </h2>
                <div className="flex flex-wrap gap-2">
                  {recipe.allergens.map(allergen => (
                    <span 
                      key={allergen}
                      className="px-3 py-1 bg-white text-amber-700 rounded-full text-sm border border-amber-200"
                    >
                      {allergen}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Side Dishes */}
            {recipe.side_dishes_detail?.length > 0 && (
              <Card className="p-6 bg-white border-gray-100">
                <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-emerald-500" />
                  Beilagen
                </h2>
                <div className="space-y-3">
                  {recipe.side_dishes_detail.map(side => {
                    const sideTime = (side.prep_time || 0) + (side.cook_time || 0);
                    return (
                      <Link
                        key={side.recipe_id}
                        to={`/recipes/${side.recipe_id}`}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 transition-all group"
                      >
                        {side.image_url ? (
                          <img
                            src={side.image_url}
                            alt={side.name}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 text-xl">
                            🍽️
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-[var(--text-primary)] truncate group-hover:text-emerald-700">
                            {side.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                              {side.category}
                            </span>
                            {sideTime > 0 && (
                              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                <Clock className="w-3 h-3" />{sideTime} Min
                              </span>
                            )}
                          </div>
                        </div>
                        <ChefHat className="w-4 h-4 text-gray-300 group-hover:text-emerald-400 flex-shrink-0 transition-colors" />
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

const NutritionRow = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
    <span className="text-[var(--text-secondary)]">{label}</span>
    <span className="font-mono text-sm font-medium text-[var(--text-primary)]">{value}</span>
  </div>
);

export default RecipeDetail;
