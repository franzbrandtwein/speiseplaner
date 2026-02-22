import { useState, useEffect } from "react";
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
  LogOut, Loader2, Send
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
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

const GroupPage = () => {
  const { user } = useAuth();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    fetchGroupData();
  }, []);

  const fetchGroupData = async () => {
    try {
      const response = await axios.get(`${API}/groups/my`, { withCredentials: true });
      setGroupData(response.data);
    } catch (error) {
      console.error("Error fetching group:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Bitte gib einen Gruppennamen ein");
      return;
    }

    setCreating(true);
    try {
      await axios.post(`${API}/groups`, { name: newGroupName }, { withCredentials: true });
      toast.success("Gruppe erstellt!");
      setNewGroupName("");
      setCreateDialogOpen(false);
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Bitte gib eine E-Mail-Adresse ein");
      return;
    }

    setInviting(true);
    try {
      const response = await axios.post(
        `${API}/groups/invite`,
        { email: inviteEmail },
        { withCredentials: true }
      );
      
      setLastInviteLink(response.data.invitation_link);
      
      if (response.data.email_sent) {
        toast.success("Einladung per E-Mail gesendet!");
      } else {
        toast.info("Einladung erstellt - E-Mail konnte nicht gesendet werden");
      }
      
      setInviteEmail("");
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler beim Einladen");
    } finally {
      setInviting(false);
    }
  };

  const handleLeaveGroup = async () => {
    try {
      await axios.post(`${API}/groups/leave`, {}, { withCredentials: true });
      toast.success("Gruppe verlassen");
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler");
    }
  };

  const copyInviteLink = () => {
    if (lastInviteLink) {
      navigator.clipboard.writeText(lastInviteLink);
      setCopiedLink(true);
      toast.success("Link kopiert!");
      setTimeout(() => setCopiedLink(false), 3000);
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

  const hasGroup = groupData?.group !== null;

  return (
    <Layout>
      <div className="animate-fade-in max-w-2xl mx-auto" data-testid="group-page">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
            <Users className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
            {hasGroup ? "Meine Gruppe" : "Gruppe erstellen"}
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            {hasGroup 
              ? "Verwalte deine Gruppe und lade Mitglieder ein" 
              : "Erstelle eine Gruppe, um Rezepte und Speisepläne zu teilen"}
          </p>
        </div>

        {!hasGroup ? (
          /* No Group - Create One */
          <Card className="p-8 bg-white border-gray-100 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)] mb-2">
              Du bist noch in keiner Gruppe
            </h2>
            <p className="text-[var(--text-muted)] mb-6">
              Erstelle eine Gruppe, um Rezepte zu teilen und einen gemeinsamen Speiseplan zu führen.
            </p>
            
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="btn-primary" data-testid="create-group-button">
                  <Plus className="w-5 h-5" /> Gruppe erstellen
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
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="z.B. Familie Müller"
                      className="mt-1"
                      data-testid="group-name-input"
                    />
                  </div>
                  <Button
                    onClick={handleCreateGroup}
                    disabled={creating}
                    className="w-full btn-primary"
                    data-testid="confirm-create-group"
                  >
                    {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gruppe erstellen"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </Card>
        ) : (
          /* Has Group */
          <div className="space-y-6">
            {/* Group Info */}
            <Card className="p-6 bg-white border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-heading text-2xl font-semibold text-[var(--text-primary)]">
                    {groupData.group.name}
                  </h2>
                  <p className="text-[var(--text-muted)]">
                    {groupData.members.length} Mitglied{groupData.members.length !== 1 ? "er" : ""}
                  </p>
                </div>
                {groupData.is_owner && (
                  <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                    <Crown className="w-4 h-4" /> Owner
                  </span>
                )}
              </div>

              {/* Members List */}
              <div className="space-y-2">
                {groupData.members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {member.picture ? (
                        <img
                          src={member.picture}
                          alt={member.name}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                          <span className="text-emerald-600 font-medium">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {member.name}
                          {member.user_id === user.user_id && (
                            <span className="text-[var(--text-muted)]"> (Du)</span>
                          )}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">{member.email}</p>
                      </div>
                    </div>
                    {member.user_id === groupData.group.owner_id && (
                      <Crown className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Invite Section */}
            <Card className="p-6 bg-white border-gray-100">
              <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4">
                Mitglieder einladen
              </h3>
              
              <div className="flex gap-2 mb-4">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="E-Mail-Adresse"
                  className="flex-1"
                  data-testid="invite-email-input"
                />
                <Button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="btn-primary"
                  data-testid="send-invite-button"
                >
                  {inviting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Einladen
                    </>
                  )}
                </Button>
              </div>

              {/* Last Invite Link */}
              {lastInviteLink && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-sm text-emerald-700 mb-2">Einladungslink:</p>
                  <div className="flex gap-2">
                    <Input
                      value={lastInviteLink}
                      readOnly
                      className="flex-1 text-sm bg-white"
                    />
                    <Button
                      onClick={copyInviteLink}
                      variant="outline"
                      className="shrink-0"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Pending Invitations */}
              {groupData.invitations?.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-[var(--text-muted)] mb-2">Ausstehende Einladungen:</p>
                  <div className="space-y-2">
                    {groupData.invitations.map((inv) => (
                      <div
                        key={inv.invitation_id}
                        className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-amber-600" />
                          {inv.invitee_email}
                        </span>
                        <span className="text-amber-600">Ausstehend</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Leave Group */}
            <Card className="p-6 bg-white border-gray-100">
              <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4">
                Gruppe verlassen
              </h3>
              <p className="text-[var(--text-muted)] text-sm mb-4">
                Wenn du die Gruppe verlässt, hast du keinen Zugriff mehr auf geteilte Rezepte und den gemeinsamen Speiseplan.
              </p>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="leave-group-button">
                    <LogOut className="w-4 h-4" /> Gruppe verlassen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gruppe verlassen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Du verlierst den Zugriff auf geteilte Rezepte und den gemeinsamen Speiseplan.
                      {groupData.is_owner && " Als Owner musst du erst alle anderen Mitglieder entfernen."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLeaveGroup}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      Verlassen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default GroupPage;
