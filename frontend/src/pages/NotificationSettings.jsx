import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import {
  Bell, BellOff, BellRing, Send, Clock, ShoppingCart,
  CalendarX, UtensilsCrossed, Settings, CheckCircle2, AlertTriangle
} from "lucide-react";

const DAYS = [
  { value: "montag", label: "Montag" },
  { value: "dienstag", label: "Dienstag" },
  { value: "mittwoch", label: "Mittwoch" },
  { value: "donnerstag", label: "Donnerstag" },
  { value: "freitag", label: "Freitag" },
  { value: "samstag", label: "Samstag" },
  { value: "sonntag", label: "Sonntag" },
];

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

const NotificationSettings = () => {
  const [permission, setPermission] = useState(Notification?.permission || "default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [prefs, setPrefs] = useState({
    meal_reminder: true,
    meal_reminder_time: "08:00",
    shopping_reminder: true,
    shopping_reminder_day: "sonntag",
    shopping_reminder_time: "10:00",
    empty_plan_reminder: true,
    empty_plan_reminder_time: "18:00",
    new_meal_notification: true,
  });

  const loadStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications/status`, { withCredentials: true });
      setSubscribed(res.data.subscribed);
      if (res.data.preferences) {
        setPrefs((prev) => ({ ...prev, ...res.data.preferences }));
      }
    } catch (e) {
      console.error("Error loading notification status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const subscribePush = async () => {
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Benachrichtigungs-Berechtigung wurde verweigert");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await axios.get(`${API}/notifications/vapid-public-key`, { withCredentials: true });
      const vapidKey = keyRes.data.public_key;
      if (!vapidKey) {
        toast.error("Push-Konfiguration nicht verfügbar");
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      await axios.post(
        `${API}/notifications/subscribe`,
        { endpoint: subJson.endpoint, keys: subJson.keys },
        { withCredentials: true }
      );

      setSubscribed(true);
      toast.success("Push-Benachrichtigungen aktiviert");
      await loadStatus();
    } catch (e) {
      console.error("Push subscription error:", e);
      toast.error("Fehler beim Aktivieren der Benachrichtigungen");
    }
  };

  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const subJson = subscription.toJSON();
        await axios.delete(`${API}/notifications/unsubscribe`, {
          data: { endpoint: subJson.endpoint },
          withCredentials: true,
        });
        await subscription.unsubscribe();
      } else {
        await axios.delete(`${API}/notifications/unsubscribe`, {
          data: {},
          withCredentials: true,
        });
      }
      setSubscribed(false);
      toast.success("Push-Benachrichtigungen deaktiviert");
    } catch (e) {
      console.error("Unsubscribe error:", e);
      toast.error("Fehler beim Deaktivieren");
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/notifications/preferences`, prefs, { withCredentials: true });
      toast.success("Einstellungen gespeichert");
    } catch (e) {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/notifications/test`, {}, { withCredentials: true });
      toast.success("Test-Benachrichtigung gesendet");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Senden");
    } finally {
      setTesting(false);
    }
  };

  const updatePref = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const swSupported = "serviceWorker" in navigator && "PushManager" in window;

  return (
    <Layout>
      <div className="animate-fade-in max-w-2xl mx-auto" data-testid="notification-settings-page">
        <div className="mb-8">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
            Benachrichtigungen
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Konfiguriere deine Push-Benachrichtigungen
          </p>
        </div>

        {/* Status Card */}
        <Card className="p-6 mb-6 bg-white border-gray-100" data-testid="notification-status-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                subscribed ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"
              }`}>
                {subscribed ? <BellRing className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                  Push-Benachrichtigungen
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {subscribed ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aktiviert
                    </span>
                  ) : !swSupported ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" /> Nicht unterstützt
                    </span>
                  ) : permission === "denied" ? (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertTriangle className="w-3.5 h-3.5" /> Im Browser blockiert
                    </span>
                  ) : (
                    "Deaktiviert"
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {subscribed ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendTest}
                    disabled={testing}
                    data-testid="test-notification-btn"
                  >
                    <Send className="w-4 h-4" />
                    {testing ? "Sende..." : "Testen"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={unsubscribePush}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    data-testid="unsubscribe-btn"
                  >
                    <BellOff className="w-4 h-4" /> Deaktivieren
                  </Button>
                </>
              ) : (
                <Button
                  onClick={subscribePush}
                  className="btn-primary"
                  disabled={!swSupported || permission === "denied"}
                  data-testid="subscribe-btn"
                >
                  <Bell className="w-4 h-4" /> Aktivieren
                </Button>
              )}
            </div>
          </div>
          {permission === "denied" && (
            <p className="mt-3 text-sm text-red-500 bg-red-50 rounded-lg p-3">
              Benachrichtigungen sind im Browser blockiert. Bitte erlaube sie in den Browser-Einstellungen
              und lade die Seite neu.
            </p>
          )}
        </Card>

        {/* Settings */}
        {subscribed && (
          <div className="space-y-4">
            {/* Instant: New Meal */}
            <Card className="p-5 bg-white border-gray-100" data-testid="pref-new-meal">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <UtensilsCrossed className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Neues Gericht hinzugefügt</h3>
                    <p className="text-xs text-[var(--text-muted)]">Sofort benachrichtigen, wenn ein neues Gericht im Speiseplan angelegt wird</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.new_meal_notification}
                  onCheckedChange={(v) => updatePref("new_meal_notification", v)}
                  data-testid="toggle-new-meal"
                />
              </div>
            </Card>

            {/* Daily Meal Reminder */}
            <Card className="p-5 bg-white border-gray-100" data-testid="pref-meal-reminder">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Tägliche Mahlzeit-Erinnerung</h3>
                    <p className="text-xs text-[var(--text-muted)]">Zeigt die geplanten Mahlzeiten des Tages</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.meal_reminder}
                  onCheckedChange={(v) => updatePref("meal_reminder", v)}
                  data-testid="toggle-meal-reminder"
                />
              </div>
              {prefs.meal_reminder && (
                <div className="pl-[52px] flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">Uhrzeit:</span>
                  <Input
                    type="time"
                    value={prefs.meal_reminder_time}
                    onChange={(e) => updatePref("meal_reminder_time", e.target.value)}
                    className="w-32 h-8 text-sm"
                    data-testid="meal-reminder-time"
                  />
                </div>
              )}
            </Card>

            {/* Shopping Reminder */}
            <Card className="p-5 bg-white border-gray-100" data-testid="pref-shopping-reminder">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Einkaufslisten-Erinnerung</h3>
                    <p className="text-xs text-[var(--text-muted)]">Wöchentliche Erinnerung an die Einkaufsliste</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.shopping_reminder}
                  onCheckedChange={(v) => updatePref("shopping_reminder", v)}
                  data-testid="toggle-shopping-reminder"
                />
              </div>
              {prefs.shopping_reminder && (
                <div className="pl-[52px] flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">Tag:</span>
                    <select
                      value={prefs.shopping_reminder_day}
                      onChange={(e) => updatePref("shopping_reminder_day", e.target.value)}
                      className="h-8 px-2 text-sm border border-gray-200 rounded-md bg-white text-[var(--text-primary)]"
                      data-testid="shopping-reminder-day"
                    >
                      {DAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">Uhrzeit:</span>
                    <Input
                      type="time"
                      value={prefs.shopping_reminder_time}
                      onChange={(e) => updatePref("shopping_reminder_time", e.target.value)}
                      className="w-32 h-8 text-sm"
                      data-testid="shopping-reminder-time"
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Empty Plan Reminder */}
            <Card className="p-5 bg-white border-gray-100" data-testid="pref-empty-plan">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
                    <CalendarX className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Leerer Speiseplan</h3>
                    <p className="text-xs text-[var(--text-muted)]">Benachrichtigung wenn für morgen noch nichts geplant ist</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.empty_plan_reminder}
                  onCheckedChange={(v) => updatePref("empty_plan_reminder", v)}
                  data-testid="toggle-empty-plan"
                />
              </div>
              {prefs.empty_plan_reminder && (
                <div className="pl-[52px] flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">Uhrzeit:</span>
                  <Input
                    type="time"
                    value={prefs.empty_plan_reminder_time}
                    onChange={(e) => updatePref("empty_plan_reminder_time", e.target.value)}
                    className="w-32 h-8 text-sm"
                    data-testid="empty-plan-time"
                  />
                </div>
              )}
            </Card>

            {/* Save Button */}
            <Button
              onClick={savePrefs}
              disabled={saving}
              className="btn-primary w-full"
              data-testid="save-notification-prefs"
            >
              <Settings className="w-4 h-4" />
              {saving ? "Speichert..." : "Einstellungen speichern"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NotificationSettings;
