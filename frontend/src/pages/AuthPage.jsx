import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ChefHat, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { API } from "../App";

// Check if running on Emergent platform
const IS_EMERGENT = window.location.hostname.includes('emergentagent.com');

const AuthPage = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    remember_me: false
  });

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin 
        ? { email: formData.email, password: formData.password, remember_me: formData.remember_me }
        : formData;

      const response = await axios.post(`${API}${endpoint}`, payload, {
        withCredentials: true
      });

      toast.success(isLogin ? "Willkommen zurück!" : "Registrierung erfolgreich!");
      navigate("/dashboard", { state: { user: response.data }, replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || "Ein Fehler ist aufgetreten";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-default)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">
            Kochplaner
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            {isLogin ? "Melde dich an" : "Erstelle dein Konto"}
          </p>
        </div>

        <Card className="p-6 bg-white border-gray-100">
          {/* Google Login - nur auf Emergent */}
          {IS_EMERGENT && (
            <>
              <Button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full btn-secondary mb-4"
                data-testid="google-login-button"
              >
                <img 
                  src="https://www.svgrepo.com/show/475656/google-color.svg" 
                  alt="Google" 
                  className="w-5 h-5" 
                />
                Mit Google fortfahren
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-[var(--text-muted)]">oder</span>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <Label htmlFor="name">Name</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Dein Name"
                    className="pl-10 input-field"
                    required={!isLogin}
                    data-testid="name-input"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email">E-Mail</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="deine@email.de"
                  className="pl-10 input-field"
                  required
                  data-testid="email-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Passwort</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="pl-10 pr-10 input-field"
                  required
                  minLength={6}
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {!isLogin && (
                <p className="text-xs text-[var(--text-muted)] mt-1">Mindestens 6 Zeichen</p>
              )}
            </div>

            {isLogin && (
              <label className="flex items-center gap-2 cursor-pointer" data-testid="remember-me-label">
                <input
                  type="checkbox"
                  checked={formData.remember_me}
                  onChange={(e) => setFormData({ ...formData, remember_me: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  data-testid="remember-me-checkbox"
                />
                <span className="text-sm text-[var(--text-secondary)]">Angemeldet bleiben</span>
              </label>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full btn-primary"
              data-testid="submit-button"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                isLogin ? "Anmelden" : "Registrieren"
              )}
            </Button>
          </form>

          {/* Toggle Login/Register */}
          <p className="text-center mt-6 text-[var(--text-secondary)]">
            {isLogin ? "Noch kein Konto?" : "Bereits registriert?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
              data-testid="toggle-auth-mode"
            >
              {isLogin ? "Registrieren" : "Anmelden"}
            </button>
          </p>
        </Card>

        {/* Back to Landing */}
        <p className="text-center mt-6">
          <a href="/" className="text-[var(--text-muted)] hover:text-emerald-600 text-sm">
            ← Zurück zur Startseite
          </a>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
