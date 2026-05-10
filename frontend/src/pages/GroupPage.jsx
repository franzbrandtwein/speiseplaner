import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import Layout from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import {
  Users, Plus, Mail, Copy, Check, UserMinus, Crown,
  LogOut, Loader2, Send, ChevronDown, ChevronUp, Star, Trash2,
  UtensilsCrossed, GripVertical, X
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";

// ── Einzelne Gruppen-Karte ────────────────────────────────────────────────────
const DEFAULT_MEAL_TYPES = [
  { key: "breakfast", label: "Frühstück" },
  { key: "lunch", label: "Mittagessen" },
  { key: "dinner", label: "Abendessen" },
];

const GroupCard = ({ group, isActive, currentUser, onSwitch, onInvited, onLeft, onDeleted }) => {
  const [expanded, setExpanded] = useState(isActive);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mealTypes, setMealTypes] = useState(group.meal_types?.length ? group.meal_types : DEFAULT_MEAL_TYPES);
  const [savingMeals, setSavingMeals] = useState(false);

  const handleSaveMealTypes = async () => {
    const valid = mealTypes.filter(mt => mt.key.trim() && mt.label.trim());
    if (valid.length === 0) return toast.error("Mindestens eine Mahlzeit erforderlich");
    const keys = valid.map(mt => mt.key.trim());
    if (new Set(keys).size !== keys.length) return toast.error("Mahlzeit-Schlüssel müssen eindeutig sein");
    setSavingMeals(true);
    try {
      await axios.put(`${API}/groups/${group.group_id}/meal-types`,
        valid.map(mt => ({ key: mt.key.trim(), label: mt.label.trim() })),
        { withCredentials: true }
      );
      toast.success("Mahlzeiten gespeichert");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Speichern");
    } finally {
      setSavingMeals(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return toast.error("Bitte E-Mail eingeben");
    setInviting(true);
    try {
      const r = await axios.post(`${API}/groups/${group.group_id}/invite`, { email: inviteEmail }, { withCredentials: true });
      setLastLink(r.data.invitation_link);
      setInviteEmail("");
      if (r.data.email_sent) toast.success("Einladung per E-Mail gesendet!");
      else toast.info("Einladung erstellt – E-Mail konnte nicht gesendet werden");
      onInvited();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Einladen");
    } finally {
      setInviting(false);
    }
  };

  const copyLink = () => {
    if (lastLink) { navigator.clipboard.writeText(lastLink); setCopied(true); toast.success("Link kopiert!"); setTimeout(() => setCopied(false), 3000); }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await axios.delete(`${API}/groups/${group.group_id}/members/${memberId}`, { withCredentials: true });
      toast.success("Mitglied entfernt");
      onLeft();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler");
    }
  };

  return (
    <Card className={`bg-white border-2 transition-colors ${isActive ? "border-emerald-400" : "border-gray-100"}`}>
      {/* Gruppen-Header */}
      <div className="p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-emerald-100" : "bg-gray-100"}`}>
            <Users className={`w-5 h-5 ${isActive ? "text-emerald-600" : "text-gray-500"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)]">{group.name}</h3>
              {isActive && <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs"><Star className="w-3 h-3" /> Aktiv</span>}
              {group.is_owner && <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs"><Crown className="w-3 h-3" /> Owner</span>}
            </div>
            <p className="text-sm text-[var(--text-muted)]">{group.members?.length ?? 0} Mitglied{(group.members?.length ?? 0) !== 1 ? "er" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isActive && (
            <Button size="sm" variant="outline" onClick={() => onSwitch(group.group_id)} className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
              Wechseln
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Ausgeklappter Bereich */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          {/* Mitgliederliste */}
          <div className="space-y-2">
            {(group.members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl">
                <div className="flex items-center gap-3">
                  {m.picture
                    ? <img src={m.picture} alt={m.name} className="w-9 h-9 rounded-full" />
                    : <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center"><span className="text-emerald-600 font-medium text-sm">{m.name.charAt(0).toUpperCase()}</span></div>
                  }
                  <div>
                    <p className="font-medium text-sm text-[var(--text-primary)]">
                      {m.name}{m.user_id === currentUser?.user_id && <span className="text-[var(--text-muted)]"> (Du)</span>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.user_id === group.owner_id && <Crown className="w-4 h-4 text-amber-500" />}
                  {group.is_owner && m.user_id !== currentUser?.user_id && (
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.user_id)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Einladen */}
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">Mitglied einladen</p>
            <div className="flex gap-2">
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="E-Mail-Adresse" className="flex-1" onKeyDown={e => e.key === "Enter" && handleInvite()} />
              <Button onClick={handleInvite} disabled={inviting} className="btn-primary shrink-0">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Einladen</>}
              </Button>
            </div>
            {lastLink && (
              <div className="mt-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-xs text-emerald-700 mb-1">Einladungslink:</p>
                <div className="flex gap-2">
                  <Input value={lastLink} readOnly className="flex-1 text-xs bg-white" />
                  <Button onClick={copyLink} variant="outline" className="shrink-0 h-9 w-9 p-0">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
                </div>
              </div>
            )}
            {group.invitations?.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-[var(--text-muted)]">Ausstehende Einladungen:</p>
                {group.invitations.map(inv => (
                  <div key={inv.invitation_id} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                    <Mail className="w-3 h-3" />{inv.invitee_email}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mahlzeiten-Konfiguration (nur für Owner) */}
          {group.is_owner && (
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4" /> Mahlzeiten konfigurieren
              </p>
              <div className="space-y-2">
                {mealTypes.map((mt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                    <Input
                      value={mt.label}
                      onChange={e => setMealTypes(prev => prev.map((m, i) => i === idx ? { ...m, label: e.target.value } : m))}
                      placeholder="Name (z.B. Frühstück)"
                      className="flex-1"
                    />
                    <Button
                      size="sm" variant="ghost"
                      className="h-9 w-9 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                      disabled={mealTypes.length <= 1}
                      onClick={() => setMealTypes(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm" variant="outline"
                  onClick={() => setMealTypes(prev => [...prev, { key: `meal_${Date.now()}`, label: "" }])}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4" /> Mahlzeit hinzufügen
                </Button>
                <Button size="sm" onClick={handleSaveMealTypes} disabled={savingMeals} className="btn-primary">
                  {savingMeals ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
                </Button>
              </div>
            </div>
          )}

          {/* Gruppe verlassen / löschen */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
                  <LogOut className="w-4 h-4" /> Verlassen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Gruppe verlassen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Du verlierst den Zugriff auf geteilte Rezepte und den gemeinsamen Speiseplan dieser Gruppe.
                    {group.is_owner && " Als Owner musst du erst alle anderen Mitglieder entfernen."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onLeft(group.group_id)} className="bg-red-500 hover:bg-red-600">Verlassen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {group.is_owner && (group.members?.length ?? 0) <= 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" /> Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gruppe löschen?</AlertDialogTitle>
                    <AlertDialogDescription>Die Gruppe wird dauerhaft gelöscht. Alle geteilten Inhalte bleiben erhalten, werden aber nicht mehr geteilt.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleted(group.group_id)} className="bg-red-500 hover:bg-red-600">Löschen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

// ── Hauptseite ────────────────────────────────────────────────────────────────
const GroupPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState({ groups: [], active_group_id: null });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/groups`, { withCredentials: true });
      setData(r.data);
    } catch {
      toast.error("Gruppen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleCreate = async () => {
    if (!newGroupName.trim()) return toast.error("Bitte Gruppenname eingeben");
    setCreating(true);
    try {
      await axios.post(`${API}/groups`, { name: newGroupName }, { withCredentials: true });
      toast.success("Gruppe erstellt!");
      setNewGroupName("");
      setCreateOpen(false);
      fetchGroups();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const handleSwitch = async (groupId) => {
    try {
      await axios.put(`${API}/groups/switch/${groupId}`, {}, { withCredentials: true });
      toast.success("Aktive Gruppe gewechselt");
      window.location.reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler");
    }
  };

  const handleLeave = async (groupId) => {
    try {
      const r = await axios.post(`${API}/groups/${groupId}/leave`, {}, { withCredentials: true });
      toast.success("Gruppe verlassen");
      if (r.data.new_active !== undefined) window.location.reload();
      else fetchGroups();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler");
    }
  };

  const handleDelete = async (groupId) => {
    try {
      await axios.delete(`${API}/groups/${groupId}`, { withCredentials: true });
      toast.success("Gruppe gelöscht");
      fetchGroups();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler");
    }
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

  return (
    <Layout>
      <div className="animate-fade-in max-w-2xl mx-auto" data-testid="group-page">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)]">Meine Gruppen</h1>
            <p className="text-[var(--text-secondary)] mt-1">
              {data.groups.length > 0
                ? `${data.groups.length} Gruppe${data.groups.length !== 1 ? "n" : ""}`
                : "Noch keine Gruppen"}
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="create-group-button">
                <Plus className="w-4 h-4" /> Neue Gruppe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Neue Gruppe erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="groupName">Gruppenname</Label>
                  <Input
                    id="groupName"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="z.B. Familie Müller"
                    className="mt-1"
                    data-testid="group-name-input"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <Button onClick={handleCreate} disabled={creating} className="w-full btn-primary" data-testid="confirm-create-group">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gruppe erstellen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {data.groups.length === 0 ? (
          <Card className="p-10 text-center border-gray-100">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Du bist noch in keiner Gruppe
            </h2>
            <p className="text-[var(--text-muted)] mb-6">
              Erstelle eine Gruppe, um Rezepte zu teilen und einen gemeinsamen Speiseplan zu führen.
            </p>
            <Button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Erste Gruppe erstellen
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.groups.map(g => (
              <GroupCard
                key={g.group_id}
                group={g}
                isActive={g.group_id === data.active_group_id}
                currentUser={user}
                onSwitch={handleSwitch}
                onInvited={fetchGroups}
                onLeft={handleLeave}
                onDeleted={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default GroupPage;
