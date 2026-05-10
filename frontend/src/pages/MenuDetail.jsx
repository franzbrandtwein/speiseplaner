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
  ArrowLeft, BookOpen, MapPin, Upload, Trash2, Utensils,
  ScanText, Image as ImageIcon, X, Plus, ChevronRight, ShoppingBag, ChevronLeft,
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
          {uploading ? "Analysiere…" : "Hochladen"}
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
              <img src={img.startsWith("/api") ? `${API.replace("/api", "")}${img}` : img} alt="" className="w-full h-full object-cover rounded-lg" />
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

// ─── Token-Klassifizierungen ──────────────────────────────────────────────────
const TOKEN_TYPES = [
  { key: "gericht", label: "Gericht", bg: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "preis",   label: "Preis",   bg: "bg-amber-100  text-amber-700  border-amber-300"   },
  { key: "skip",    label: "Skip",    bg: "bg-gray-100   text-gray-400   border-gray-200"    },
];

const TokenRow = ({ token, onChange }) => {
  const type = TOKEN_TYPES.find(t => t.key === token.class) || TOKEN_TYPES[2];
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-opacity ${type.bg} ${token.class === "skip" ? "opacity-40" : ""}`}>
      <span className={`flex-1 truncate ${token.class === "skip" ? "line-through" : "font-medium"}`}>
        {token.text}
      </span>
      <div className="flex gap-1 flex-shrink-0">
        {TOKEN_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-2 py-0.5 rounded text-xs border transition-all ${
              token.class === t.key
                ? t.bg + " font-semibold"
                : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Extraktions-Wizard ───────────────────────────────────────────────────────
const ExtractDialog = ({ open, onClose, menuId, onDone, initialTokens = null }) => {
  const [step, setStep]       = useState(initialTokens ? 1 : 0);
  const [inputMode, setInputMode] = useState("text"); // "text" | "image"
  const [text, setText]       = useState("");
  const [tokens, setTokens]   = useState(initialTokens || []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const fileRef = useRef();

  // Wenn von außen Tokens übergeben werden (z.B. nach Galerie-Upload), direkt zu Schritt 1
  useEffect(() => {
    if (initialTokens) { setTokens(initialTokens); setStep(1); }
  }, [initialTokens]);

  const handleClose = () => {
    setText(""); setTokens([]); setStep(0); setInputMode("text"); onClose();
  };

  const analyze = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/menus/${menuId}/tokenize-text`,
        { text },
        { withCredentials: true }
      );
      setTokens(data.tokens);
      setStep(1);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Analyse fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const analyzeImage = async (file) => {
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
      setTokens(data.tokens);
      setStep(1);
    } catch (err) {
      toast.error(err.response?.data?.detail || "OCR fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const setTokenClass = (id, cls) =>
    setTokens(prev => prev.map(t => t.id === id ? { ...t, class: cls } : t));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.post(
        `${API}/menus/${menuId}/save-classified`,
        { tokens },
        { withCredentials: true }
      );
      toast.success(`${data.extracted} Gerichte angelegt`);
      onDone(data);
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const gerichtCount = tokens.filter(t => t.class === "gericht").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <ScanText className="w-5 h-5 text-emerald-500" />
            {step === 0 ? "Speisekarte einlesen" : "Textbausteine prüfen"}
          </DialogTitle>
          {step === 1 && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Klicke auf einen Typ um die Erkennung zu korrigieren.
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 ? (
            <div className="space-y-3">
              {/* Tab-Wahl */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setInputMode("text")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                    inputMode === "text" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <ScanText className="w-3.5 h-3.5" /> Text eingeben
                </button>
                <button
                  onClick={() => setInputMode("image")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                    inputMode === "image" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Foto hochladen
                </button>
              </div>

              {inputMode === "text" ? (
                <textarea
                  className="w-full h-48 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder={"Speisekarten-Text hier einfügen…\n\nBruschetta ......... 4,50\nSuppe des Tages ..... 5,90\nWiener Schnitzel ... 18,50"}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  autoFocus
                />
              ) : (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl h-44 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => !loading && fileRef.current?.click()}
                >
                  {loading
                    ? <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    : <>
                        <ImageIcon className="w-10 h-10 text-gray-300 mb-2" />
                        <span className="text-sm text-[var(--text-muted)]">Foto der Speisekarte auswählen</span>
                        <span className="text-xs text-[var(--text-muted)] mt-1">Text wird automatisch erkannt (OCR)</span>
                      </>
                  }
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => analyzeImage(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-1">
              {tokens.map(token => (
                <TokenRow key={token.id} token={token} onChange={cls => setTokenClass(token.id, cls)} />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between gap-3">
          {step === 0 ? (
            inputMode === "text" ? (
              <Button
                className="btn-primary w-full"
                onClick={analyze}
                disabled={loading || text.trim().length < 5}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  : <ScanText className="w-4 h-4 mr-2" />
                }
                Analysieren
              </Button>
            ) : (
              <p className="text-xs text-[var(--text-muted)] w-full text-center">
                Foto auswählen um OCR zu starten
              </p>
            )
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Zurück
              </Button>
              <span className="text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-emerald-600">{gerichtCount}</span> Gerichte
              </span>
              <Button
                className="btn-primary"
                size="sm"
                onClick={save}
                disabled={saving || gerichtCount === 0}
              >
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />}
                Gerichte anlegen
              </Button>
            </>
          )}
        </div>
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
  const [extractTokens, setExtractTokens] = useState(null);

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
      // extract-image speichert das Bild UND führt LLM-Erkennung durch
      const { data } = await axios.post(`${API}/menus/${id}/extract-image`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.image_url) {
        setMenu(prev => ({ ...prev, images: [...(prev.images || []), data.image_url] }));
      }
      if (data.tokens?.length > 0) {
        setExtractTokens(data.tokens);
        setExtractOpen(true);
      } else {
        toast.info("Bild hochgeladen – keine Gerichte automatisch erkannt. Bitte Text manuell eingeben.");
        setExtractOpen(true);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Bild-Upload fehlgeschlagen";
      toast.error(msg);
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
            <ScanText className="w-4 h-4 mr-2" />
            Aus Text erkennen
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
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Aus Text hinzufügen
                </Button>
              </div>

              {(!menu.recipes || menu.recipes.length === 0) ? (
                <div className="py-10 text-center">
                  <BookOpen className="w-10 h-10 mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">Noch keine Gerichte</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Text aus der Speisekarte einfügen – Gerichte werden automatisch erkannt
                  </p>
                  <Button
                    className="btn-primary mt-3"
                    size="sm"
                    onClick={() => setExtractOpen(true)}
                  >
                    <ScanText className="w-4 h-4 mr-2" /> Gerichte erkennen
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
        onClose={() => { setExtractOpen(false); setExtractTokens(null); }}
        menuId={id}
        onDone={onExtractDone}
        initialTokens={extractTokens}
      />
    </Layout>
  );
}
