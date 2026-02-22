import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Users, Check, X, ChefHat } from "lucide-react";

const InvitePage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkAuthAndLoadInvitation();
  }, [token]);

  const checkAuthAndLoadInvitation = async () => {
    try {
      // Prüfe ob eingeloggt
      try {
        await axios.get(`${API}/auth/me`, { withCredentials: true });
        setIsLoggedIn(true);
      } catch {
        setIsLoggedIn(false);
      }

      // Lade Einladungs-Details
      const response = await axios.get(`${API}/invitations/${token}`);
      setInvitation(response.data);
    } catch (error) {
      setError(error.response?.data?.detail || "Einladung nicht gefunden");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!isLoggedIn) {
      // Speichere Token und leite zur Auth-Seite
      localStorage.setItem("pendingInvitation", token);
      navigate("/auth");
      return;
    }

    setAccepting(true);
    try {
      await axios.post(`${API}/invitations/${token}/accept`, {}, { withCredentials: true });
      toast.success("Einladung angenommen!");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler beim Annehmen");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)] p-6">
        <Card className="max-w-md w-full p-8 text-center bg-white">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)] mb-2">
            Einladung ungültig
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{error}</p>
          <Button onClick={() => navigate("/")} className="btn-primary">
            Zur Startseite
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)] p-6">
      <Card className="max-w-md w-full p-8 bg-white">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
            <Users className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">
            Gruppen-Einladung
          </h1>
        </div>

        {/* Invitation Details */}
        <div className="bg-[var(--bg-subtle)] rounded-xl p-6 mb-6 text-center">
          <p className="text-[var(--text-secondary)] mb-2">
            <strong className="text-[var(--text-primary)]">{invitation.inviter_name}</strong> lädt dich ein:
          </p>
          <p className="font-heading text-xl font-semibold text-emerald-600">
            "{invitation.group_name}"
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-6">
          <p className="text-sm text-[var(--text-muted)] mb-3">Als Mitglied kannst du:</p>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Gemeinsame Rezepte sehen und teilen
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Einen geteilten Speiseplan nutzen
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Zusammen Einkaufslisten verwalten
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full btn-primary"
            data-testid="accept-invitation-button"
          >
            {accepting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-5 h-5" />
                {isLoggedIn ? "Einladung annehmen" : "Anmelden & Annehmen"}
              </>
            )}
          </Button>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="w-full"
          >
            Ablehnen
          </Button>
        </div>

        {!isLoggedIn && (
          <p className="text-center text-sm text-[var(--text-muted)] mt-4">
            Du wirst zur Anmeldung weitergeleitet
          </p>
        )}
      </Card>
    </div>
  );
};

export default InvitePage;
