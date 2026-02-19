import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { 
  ChefHat, Calendar, ShoppingCart, Plus, Star, Clock, 
  TrendingUp, Utensils 
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { de } from "date-fns/locale";

const Dashboard = () => {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [recipesRes, planRes] = await Promise.all([
          axios.get(`${API}/recipes`, { withCredentials: true }),
          axios.get(`${API}/mealplans?week_start=${weekStart}`, { withCredentials: true })
        ]);
        setRecipes(recipesRes.data);
        setMealPlan(planRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekStart]);

  const recentRecipes = recipes.slice(0, 4);
  const topRatedRecipes = [...recipes].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0)).slice(0, 3);

  const todayMeals = mealPlan?.days?.find(
    d => d.date === format(new Date(), "yyyy-MM-dd")
  );

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
      <div className="animate-fade-in" data-testid="dashboard-page">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-2">
            Hallo, {user?.name?.split(" ")[0] || "Koch"}!
          </h1>
          <p className="text-[var(--text-secondary)]">
            {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <StatCard
            icon={<ChefHat className="w-6 h-6" />}
            title="Rezepte"
            value={recipes.length}
            color="emerald"
            link="/recipes"
          />
          <StatCard
            icon={<Calendar className="w-6 h-6" />}
            title="Geplante Mahlzeiten"
            value={countPlannedMeals(mealPlan)}
            color="amber"
            link="/meal-planner"
          />
          <StatCard
            icon={<Star className="w-6 h-6" />}
            title="Bewertungen"
            value={recipes.reduce((sum, r) => sum + (r.rating_count || 0), 0)}
            color="orange"
            link="/recipes"
          />

          {/* Today's Plan */}
          <Card className="lg:col-span-2 p-6 bg-white border-gray-100" data-testid="todays-plan">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                Heute auf dem Plan
              </h2>
              <Link to="/meal-planner">
                <Button variant="ghost" className="text-emerald-600 hover:bg-emerald-50">
                  Planer öffnen
                </Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <MealSlotCard meal="Frühstück" data={todayMeals?.breakfast} />
              <MealSlotCard meal="Mittagessen" data={todayMeals?.lunch} />
              <MealSlotCard meal="Abendessen" data={todayMeals?.dinner} />
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6 bg-emerald-500 text-white border-0" data-testid="quick-actions">
            <h2 className="font-heading text-xl font-semibold mb-4">Schnellaktionen</h2>
            <div className="space-y-3">
              <Link to="/recipes/new" className="block">
                <Button className="w-full bg-white/20 hover:bg-white/30 text-white border-0 justify-start">
                  <Plus className="w-4 h-4 mr-2" /> Neues Rezept
                </Button>
              </Link>
              <Link to="/meal-planner" className="block">
                <Button className="w-full bg-white/20 hover:bg-white/30 text-white border-0 justify-start">
                  <Calendar className="w-4 h-4 mr-2" /> Woche planen
                </Button>
              </Link>
              <Link to="/shopping-list" className="block">
                <Button className="w-full bg-white/20 hover:bg-white/30 text-white border-0 justify-start">
                  <ShoppingCart className="w-4 h-4 mr-2" /> Einkaufsliste
                </Button>
              </Link>
            </div>
          </Card>

          {/* Recent Recipes */}
          <Card className="lg:col-span-2 p-6 bg-white border-gray-100" data-testid="recent-recipes">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                Neueste Rezepte
              </h2>
              <Link to="/recipes">
                <Button variant="ghost" className="text-emerald-600 hover:bg-emerald-50">
                  Alle ansehen
                </Button>
              </Link>
            </div>
            
            {recentRecipes.length === 0 ? (
              <div className="text-center py-8">
                <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-[var(--text-muted)]">Noch keine Rezepte</p>
                <Link to="/recipes/new">
                  <Button className="mt-4 btn-primary">
                    <Plus className="w-4 h-4 mr-2" /> Erstes Rezept erstellen
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {recentRecipes.map(recipe => (
                  <RecipeCard key={recipe.recipe_id} recipe={recipe} />
                ))}
              </div>
            )}
          </Card>

          {/* Top Rated */}
          <Card className="p-6 bg-white border-gray-100" data-testid="top-rated">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                Top bewertet
              </h2>
            </div>
            
            {topRatedRecipes.length === 0 ? (
              <p className="text-[var(--text-muted)] text-center py-4">
                Noch keine Bewertungen
              </p>
            ) : (
              <div className="space-y-3">
                {topRatedRecipes.map((recipe, idx) => (
                  <Link 
                    key={recipe.recipe_id} 
                    to={`/recipes/${recipe.recipe_id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 text-sm font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">{recipe.name}</p>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-sm text-[var(--text-secondary)]">
                          {(recipe.avg_rating || 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

const StatCard = ({ icon, title, value, color, link }) => {
  const colorClasses = {
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    orange: "bg-orange-100 text-orange-600"
  };

  return (
    <Link to={link}>
      <Card className="p-6 bg-white border-gray-100 hover:border-emerald-200 hover:shadow-lg transition-all cursor-pointer">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colorClasses[color]}`}>
          {icon}
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-1">{title}</p>
        <p className="font-heading text-3xl font-bold text-[var(--text-primary)]">{value}</p>
      </Card>
    </Link>
  );
};

const MealSlotCard = ({ meal, data }) => (
  <div className="p-4 bg-[var(--bg-subtle)] rounded-xl">
    <p className="text-sm text-[var(--text-muted)] mb-2">{meal}</p>
    {data?.recipe_name ? (
      <p className="font-medium text-[var(--text-primary)] truncate">{data.recipe_name}</p>
    ) : (
      <p className="text-[var(--text-muted)] italic">Nicht geplant</p>
    )}
  </div>
);

const RecipeCard = ({ recipe }) => (
  <Link to={`/recipes/${recipe.recipe_id}`}>
    <div className="group cursor-pointer">
      <div className="aspect-square rounded-xl overflow-hidden mb-2 bg-gray-100">
        {recipe.image_url ? (
          <img 
            src={recipe.image_url} 
            alt={recipe.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ChefHat className="w-8 h-8 text-gray-300" />
          </div>
        )}
      </div>
      <p className="font-medium text-[var(--text-primary)] truncate group-hover:text-emerald-600 transition-colors">
        {recipe.name}
      </p>
      {recipe.prep_time && (
        <div className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
          <Clock className="w-3 h-3" />
          {recipe.prep_time + (recipe.cook_time || 0)} Min
        </div>
      )}
    </div>
  </Link>
);

const countPlannedMeals = (plan) => {
  if (!plan?.days) return 0;
  let count = 0;
  plan.days.forEach(day => {
    if (day.breakfast?.recipe_id) count++;
    if (day.lunch?.recipe_id) count++;
    if (day.dinner?.recipe_id) count++;
  });
  return count;
};

export default Dashboard;
