import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { toast } from "sonner";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  ArrowLeft, BookOpen, MapPin, Upload, Trash2, Utensils, Sparkles,
  ScanText, Image as ImageIcon, X, Plus, ChevronRight, ShoppingBag,
} from "lucide-react";

// ─── Bild-Galerie ─────────────────────────────────────────────────────────────
const ImageGallery = ({ images, onUpload, onDelete, uploading }) => {
  const fileRef = useRef();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">Bilder</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mr-2" />
            : <Upload className="w-4 h-4 mr-2" />
          }
          Hochladen
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files[0])} />
      </div>
      {images.length === 0 ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon className="w-8 h-8 text-gray-300 mb-1" />
          <span className="text-sm text-[var(--text-muted)]">Bild hochladen</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group aspect-square">
              <img src={img} alt="" className="w-full h-full object-cover rounded-lg" />
              <button
                onClick={() => onDelete(img)}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Extraktions-Dialog ───────────────────────────────────────────────────────
const ExtractDialog = ({ open, onClose, menuId, onDone }) => {
  const [mode, setMode] = useState("text"); // "text" | "image"
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const extractText = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/menus/${menuId}/extract-text`,
        { text },
        { withCredentials: true }
      );
      toast.success(`${data.extracted} Gerichte extrahiert`);
      onDone(data);
      onClose();
      setText("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Extraktion fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const extractImage = async (file) => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await axios.post(
        `${API}/menus/${menuId}/extract-image`,
        fd,
        { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
      );
      toast.success(`${data.extracted} Gerichte aus Bild extrahiert`);
      onDone(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bild-Extraktion fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Gerichte aus Speisekarte extrahieren
          </DialogTitle>
        </DialogHeader>

        {/* Modus-Wahl */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("text")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
              mode === "text" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
            }`}
          >
            <ScanText className="w-4 h-4" /> Text eingeben
          </button>
          <button
            onClick={() => setMode("image")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
              mode === "image" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Bild hochladen
          </button>
        </div>

        {mode === "text" ? (
          <div className="space-y-3">
            <textarea
              className="w-full h-48 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="Speisekarten-Text hier einfügen…"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <Button
              className="w-full btn-primary"
              onClick={extractText}
              disabled={loading || text.trim().length < 10}
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                : <Sparkles className="w-4 h-4 mr-2" />
              }
              Gerichte extrahieren
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {loading
                ? <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                : <>
                    <ImageIcon className="w-10 h-10 text-gray-300 mb-2" />
                    <span className="text-sm text-[var(--text-muted)]">Bild der Speisekarte auswählen</span>
                  </>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => extractImage(e.target.files[0])}
            />
            <p className="text-xs text-[var(--text-muted)] text-center">
              Das Bild wird gespeichert und von KI analysiert
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Gericht-Karte ────────────────────────────────────────────────────────────
const RecipeCard = ({ recipe, onUnlink }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 group">
    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
      <ShoppingBag className="w-5 h-5 text-amber-400" />
    </div>
    <div className="flex-1 min-w-0">
      <Link
        to={`/recipes/${recipe.recipe_id}`}
        className="font-medium text-sm text-[var(--text-primary)] hover:text-emerald-600 truncate block"
      >
        {recipe.name}
      </Link>
      {recipe.description && (
        <p className="text-xs text-[var(--text-muted)] truncate">{recipe.description}</p>
      )}
      {recipe.cost_per_portion && (
        <p className="text-xs text-emerald-600 font-medium">{Number(recipe.cost_per_portion).toFixed(2)} €</p>
      )}
    </div>
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Link to={`/recipes/${recipe.recipe_id}`}>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </Link>
      <button onClick={() => onUnlink(recipe.recipe_id)} className="p-1 hover:text-red-500 text-gray-300">
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────
export default function MenuDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/menus/${id}`, { withCredentials: true });
      setMenu(data);
    } catch {
      toast.error("Speisekarte konnte nicht geladen werden");
      navigate("/menus");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await axios.post(`${API}/menus/${id}/images`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMenu(prev => ({ ...prev, images: data.images }));
      toast.success("Bild hochgeladen");
    } catch {
      toast.error("Bild-Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageUrl) => {
    try {
      const { data } = await axios.delete(`${API}/menus/${id}/images`, {
        data: { image_url: imageUrl },
        withCredentials: true,
      });
      setMenu(prev => ({ ...prev, images: data.images }));
    } catch {
      toast.error("Bild konnte nicht entfernt werden");
    }
  };

  const unlinkRecipe = async (recipeId) => {
    try {
      await axios.delete(`${API}/menus/${id}/recipes/${recipeId}`, { withCredentials: true });
      setMenu(prev => ({
        ...prev,
        recipes: prev.recipes.filter(r => r.recipe_id !== recipeId),
        recipe_ids: prev.recipe_ids.filter(rid => rid !== recipeId),
      }));
    } catch {
      toast.error("Verknüpfung konnte nicht entfernt werden");
    }
  };

  const onExtractDone = (result) => {
    setMenu(prev => ({
      ...prev,
      recipes: [...(prev.recipes || []), ...result.recipes],
      recipe_ids: result.menu_recipe_ids,
      images: result.images || prev.images,
    }));
  };

  if (loading) return <Layout><div className="p-8 text-center text-[var(--text-muted)]">Lade…</div></Layout>;
  if (!menu) return null;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Breadcrumb + Header */}
        <div className="flex items-center gap-2 mb-6 text-sm text-[var(--text-muted)]">
          <Link to="/menus" className="hover:text-emerald-600 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Speisekarten
          </Link>
        </div>

        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">{menu.name}</h1>
            {menu.source && (
              <p className="text-[var(--text-muted)] flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4" />
                {menu.source.name}
              </p>
            )}
            {menu.notes && <p className="text-sm text-[var(--text-muted)] mt-1 italic">{menu.notes}</p>}
          </div>
          <Button
            className="btn-primary flex-shrink-0"
            onClick={() => setExtractOpen(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            KI-Extraktion
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Bilder */}
          <div className="lg:col-span-1">
            <Card className="p-5 bg-white">
              <ImageGallery
                images={menu.images || []}
                onUpload={uploadImage}
                onDelete={deleteImage}
                uploading={uploading}
              />
            </Card>
          </div>

          {/* Gerichte */}
          <div className="lg:col-span-2">
            <Card className="p-5 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-500" />
                  Gerichte
                  <span className="text-xs font-normal text-[var(--text-muted)] bg-gray-100 rounded-full px-2 py-0.5">
                    {menu.recipes?.length || 0}
                  </span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExtractOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Via KI hinzufügen
                </Button>
              </div>

              {(!menu.recipes || menu.recipes.length === 0) ? (
                <div className="py-10 text-center">
                  <BookOpen className="w-10 h-10 mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">Noch keine Gerichte</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Nutze die KI-Extraktion um Gerichte aus Text oder Bildern zu importieren
                  </p>
                  <Button
                    className="btn-primary mt-3"
                    size="sm"
                    onClick={() => setExtractOpen(true)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> Gerichte extrahieren
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {menu.recipes.map(r => (
                    <RecipeCard key={r.recipe_id} recipe={r} onUnlink={unlinkRecipe} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <ExtractDialog
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        menuId={id}
        onDone={onExtractDone}
      />
    </Layout>
  );
}
