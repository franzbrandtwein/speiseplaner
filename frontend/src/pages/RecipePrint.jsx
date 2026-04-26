import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Printer } from "lucide-react";
import { Button } from "../components/ui/button";

const RecipePrint = () => {
  const { id } = useParams();
  const [recipe, setRecipe] = useState(null);
  const [multiplier, setMultiplier] = useState(1);

  useEffect(() => {
    axios.get(`${API}/recipes/${id}`, { withCredentials: true })
      .then(res => setRecipe(res.data))
      .catch(() => {});
  }, [id]);

  if (!recipe) return <div className="p-8 text-center text-gray-500">Laden...</div>;

  const portions = (recipe.portions || 4) * multiplier;

  const scaleAmount = (amount) => {
    if (!amount) return amount;
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    const scaled = num * multiplier;
    return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
  };

  return (
    <div className="max-w-[700px] mx-auto p-8 bg-white print:p-4">
      {/* Print button - hidden when printing */}
      <div className="flex items-center gap-3 mb-6 print:hidden">
        <Button onClick={() => window.print()} className="btn-primary">
          <Printer className="w-4 h-4" /> Drucken
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span>Portionen:</span>
          {[0.5, 1, 2, 3, 4].map(m => (
            <button
              key={m}
              onClick={() => setMultiplier(m)}
              className={`px-2 py-1 rounded text-sm ${multiplier === m ? "bg-emerald-100 text-emerald-700 font-semibold" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              {m}x
            </button>
          ))}
        </div>
      </div>

      {/* Recipe header */}
      <h1 className="text-2xl font-bold mb-1">{recipe.name}</h1>
      <div className="flex gap-4 text-sm text-gray-600 mb-4">
        {recipe.category && <span>{recipe.category}</span>}
        <span>{portions} Portionen</span>
        {recipe.prep_time && <span>Vorbereitung: {recipe.prep_time} Min</span>}
        {recipe.cook_time && <span>Kochzeit: {recipe.cook_time} Min</span>}
      </div>
      {recipe.description && <p className="text-sm text-gray-600 mb-4">{recipe.description}</p>}

      <hr className="my-4 border-gray-300" />

      {/* Ingredients */}
      <h2 className="text-lg font-bold mb-2">Zutaten</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-6">
        {recipe.ingredients?.map((ing, i) => (
          <div key={i} className="flex gap-2 text-sm py-0.5">
            <span className="font-medium whitespace-nowrap">{scaleAmount(ing.amount)} {ing.unit}</span>
            <span>{ing.name}</span>
          </div>
        ))}
      </div>

      {/* Nutrition if available */}
      {recipe.nutrition && (recipe.nutrition.calories || recipe.nutrition.protein) && (
        <>
          <h2 className="text-lg font-bold mb-2">Nährwerte (gesamt)</h2>
          <div className="flex gap-6 text-sm mb-6">
            {recipe.nutrition.calories && <span>{Math.round(recipe.nutrition.calories * multiplier)} kcal</span>}
            {recipe.nutrition.protein && <span>Protein: {(recipe.nutrition.protein * multiplier).toFixed(1)}g</span>}
            {recipe.nutrition.carbs && <span>Kohlenhydrate: {(recipe.nutrition.carbs * multiplier).toFixed(1)}g</span>}
            {recipe.nutrition.fat && <span>Fett: {(recipe.nutrition.fat * multiplier).toFixed(1)}g</span>}
          </div>
        </>
      )}

      <hr className="my-4 border-gray-300" />

      {/* Instructions */}
      <h2 className="text-lg font-bold mb-2">Zubereitung</h2>
      <ol className="list-decimal list-outside ml-5 space-y-2">
        {recipe.instructions?.map((step, i) => (
          <li key={i} className="text-sm leading-relaxed pl-1">{step}</li>
        ))}
      </ol>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .max-w-\\[700px\\], .max-w-\\[700px\\] * { visibility: visible; }
          .max-w-\\[700px\\] { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default RecipePrint;
