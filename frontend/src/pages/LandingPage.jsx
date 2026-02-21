import { ChefHat, Calendar, ShoppingCart, Star, Clock, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";

// Check if running on Emergent platform
const IS_EMERGENT = window.location.hostname.includes('emergentagent.com');

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const handleGoogleLogin = () => {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[var(--bg-default)]">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1766596663327-b932edfe968b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMGhlYWx0aHklMjBjb29raW5nJTIwaW5ncmVkaWVudHMlMjBraXRjaGVufGVufDB8fHx8MTc3MTU0MDc3M3ww&ixlib=rb-4.1.0&q=85"
            alt="Fresh cooking ingredients"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/60 to-white"></div>
        </div>
        
        <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
            <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
              Kochplaner
            </span>
          </div>
          
          {IS_EMERGENT ? (
            <Button
              onClick={handleGoogleLogin}
              data-testid="login-button-nav"
              className="btn-primary"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
              Anmelden
            </Button>
          ) : (
            <Link to="/auth">
              <Button data-testid="login-button-nav" className="btn-primary">
                Anmelden
              </Button>
            </Link>
          )}
        </nav>

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--text-primary)] leading-tight mb-6">
              Deine Rezepte,<br />
              <span className="text-emerald-500">perfekt geplant</span>
            </h1>
            <p className="text-base md:text-lg text-[var(--text-secondary)] mb-8 max-w-xl">
              Erfasse deine Lieblingsrezepte, plane Mahlzeiten für die ganze Woche 
              und erstelle automatisch Einkaufslisten. Kochen war noch nie so einfach.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {IS_EMERGENT ? (
                <Button
                  onClick={handleGoogleLogin}
                  data-testid="get-started-button"
                  className="btn-primary text-lg px-8 py-4"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                  Kostenlos starten
                </Button>
              ) : (
                <Link to="/auth">
                  <Button data-testid="get-started-button" className="btn-primary text-lg px-8 py-4">
                    Kostenlos starten
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-center text-[var(--text-primary)] mb-4">
            Alles was du brauchst
          </h2>
          <p className="text-[var(--text-secondary)] text-center mb-16 max-w-2xl mx-auto">
            Kochplaner vereint Rezeptverwaltung, Meal Planning und Einkaufslisten in einer eleganten App.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<ChefHat className="w-8 h-8" />}
              title="Rezepte erfassen"
              description="Speichere alle Details: Zutaten, Zubereitung, Nährwerte, Allergene und Kosten pro Portion."
            />
            <FeatureCard
              icon={<Calendar className="w-8 h-8" />}
              title="Woche planen"
              description="Plane Frühstück, Mittag und Abendessen für jeden Tag. Drag & Drop macht es kinderleicht."
            />
            <FeatureCard
              icon={<ShoppingCart className="w-8 h-8" />}
              title="Einkaufsliste"
              description="Automatische Einkaufslisten aus deinem Speiseplan. Nie wieder vergessene Zutaten."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-6 bg-[var(--bg-subtle)]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <StatCard icon={<Star />} value="5 Sterne" label="Bewertungssystem" />
          <StatCard icon={<Clock />} value="7 Tage" label="Wochenplanung" />
          <StatCard icon={<Users />} value="3 Mahlzeiten" label="Pro Tag" />
          <StatCard icon={<ChefHat />} value="∞" label="Rezepte" />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-emerald-500">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-6">
            Bereit für stressfreies Kochen?
          </h2>
          <p className="text-emerald-100 mb-8">
            Starte jetzt kostenlos und erlebe, wie einfach Meal Planning sein kann.
          </p>
          {IS_EMERGENT ? (
            <Button
              onClick={handleGoogleLogin}
              data-testid="cta-button"
              className="bg-white text-emerald-600 hover:bg-gray-100 px-8 py-4 rounded-full font-medium text-lg shadow-xl hover:shadow-2xl transition-all"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 mr-2 inline" />
              Mit Google anmelden
            </Button>
          ) : (
            <Link to="/auth">
              <Button
                data-testid="cta-button"
                className="bg-white text-emerald-600 hover:bg-gray-100 px-8 py-4 rounded-full font-medium text-lg shadow-xl hover:shadow-2xl transition-all"
              >
                Jetzt starten
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-[var(--text-primary)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-medium">Kochplaner</span>
          </div>
          <p className="text-gray-400 text-sm">
            © 2026 Kochplaner. Mit Liebe zum Kochen gemacht.
          </p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }) => (
  <div className="bg-[var(--bg-default)] p-8 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-lg transition-all duration-300">
    <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-6">
      {icon}
    </div>
    <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-3">{title}</h3>
    <p className="text-[var(--text-secondary)]">{description}</p>
  </div>
);

const StatCard = ({ icon, value, label }) => (
  <div className="text-center">
    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-3">
      {icon}
    </div>
    <div className="font-heading text-2xl font-bold text-[var(--text-primary)]">{value}</div>
    <div className="text-sm text-[var(--text-secondary)]">{label}</div>
  </div>
);

export default LandingPage;
