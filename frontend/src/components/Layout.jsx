import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "./ui/button";
import { 
  ChefHat, LayoutDashboard, BookOpen, Calendar, ShoppingCart, 
  LogOut, Menu, X, User, Sparkles, Users, RefreshCw, Bell, Package, Flame, Shield, Archive,
  Database, MapPin, ChevronDown, Check
} from "lucide-react";
import InstallPrompt, { InstallButton } from "./InstallPrompt";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "sonner";

const Layout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState(null);

  // Listen for SW update events
  useEffect(() => {
    const handleUpdate = (event) => {
      setUpdateAvailable(true);
      setUpdateRegistration(event.detail);
    };
    window.addEventListener('pwa-update-available', handleUpdate);
    return () => window.removeEventListener('pwa-update-available', handleUpdate);
  }, []);

  const handleApplyUpdate = () => {
    if (updateRegistration && updateRegistration.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      toast.success("Erfolgreich abgemeldet");
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      navigate("/");
    }
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  useEffect(() => {
    // Get admin status from /auth/me (avoids 403 console noise from probing /admin/users)
    axios.get(`${API}/auth/me`, { withCredentials: true })
      .then((res) => setIsAdmin(!!res.data?.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/groups`, { withCredentials: true });
      setGroups(r.data.groups ?? []);
      setActiveGroupId(r.data.active_group_id ?? null);
    } catch { /* ignorieren */ }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleSwitchGroup = async (groupId) => {
    if (groupId === activeGroupId) { setGroupMenuOpen(false); return; }
    try {
      await axios.put(`${API}/groups/switch/${groupId}`, {}, { withCredentials: true });
      setGroupMenuOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fehler beim Wechseln");
    }
  };

  const activeGroup = groups.find(g => g.group_id === activeGroupId);

  const navGroups = [
    {
      items: [
        { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { path: "/recipes", label: "Rezepte", icon: BookOpen },
        { path: "/ingredient-search", label: "Was kochen?", icon: Sparkles },
        { path: "/meal-planner", label: "Speiseplan", icon: Calendar },
        { path: "/shopping-list", label: "Einkaufsliste", icon: ShoppingCart },
        { path: "/pantry", label: "Speisekammer", icon: Archive },
        { path: "/staple-items", label: "Sonstige Artikel", icon: Package },
        { path: "/nutrition", label: "Nährwerte", icon: Flame },
      ],
    },
    {
      label: "Verwaltung",
      items: [
        { path: "/ingredients", label: "Zutaten-Stammdaten", icon: Database },
        { path: "/sources", label: "Bezugsquellen", icon: MapPin },
        { path: "/group", label: "Gruppe", icon: Users },
        { path: "/notifications", label: "Benachrichtigungen", icon: Bell },
        ...(isAdmin ? [{ path: "/admin", label: "Admin", icon: Shield }] : []),
      ],
    },
  ];

  // Flache Liste für Mobilnavigation (erste Gruppe)
  const navItems = navGroups.flatMap(g => g.items);

  return (
    <div className="min-h-screen bg-[var(--bg-default)]">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 p-6 flex-col gap-2 z-50 hidden md:flex">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <span className="font-heading text-xl font-bold text-[var(--text-primary)]">
            Kochplaner
          </span>
        </Link>

        {/* Gruppen-Switcher */}
        {groups.length > 0 && (
          <div className="relative mb-4">
            <button
              onClick={() => setGroupMenuOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-gray-100 transition-colors text-sm text-[var(--text-secondary)]"
            >
              <Users className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="flex-1 text-left truncate font-medium text-[var(--text-primary)]">
                {activeGroup?.name ?? "Keine Gruppe"}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${groupMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {groupMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {groups.map(g => (
                  <button
                    key={g.group_id}
                    onClick={() => handleSwitchGroup(g.group_id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left transition-colors"
                  >
                    <span className="flex-1 truncate text-[var(--text-primary)]">{g.name}</span>
                    {g.group_id === activeGroupId && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                ))}
                <div className="border-t border-gray-100">
                  <Link
                    to="/group"
                    onClick={() => setGroupMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-emerald-600"
                  >
                    <Users className="w-4 h-4" /> Gruppen verwalten
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 mt-4 mb-1">
                  {group.label}
                </p>
              )}
              {group.items.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path ||
                  (path !== "/dashboard" && location.pathname.startsWith(path));
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`nav-link ${isActive ? "active" : ""}`}
                    data-testid={`nav-${path.replace("/", "")}`}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Install Button */}
        <div className="py-3">
          <InstallButton variant="nav" />
        </div>

        {/* User Menu */}
        <div className="pt-4 border-t border-gray-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors" data-testid="user-menu-button">
                {user?.picture ? (
                  <img 
                    src={user.picture} 
                    alt={user.name} 
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm text-[var(--text-primary)] truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {user?.email}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="logout-button">
                <LogOut className="w-4 h-4 mr-2" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 px-4 flex items-center justify-between z-50 md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <span className="font-heading text-lg font-bold text-[var(--text-primary)]">
            Kochplaner
          </span>
        </Link>
        
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg"
          data-testid="mobile-menu-button"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="absolute right-0 top-16 w-64 h-[calc(100vh-4rem)] bg-white p-4 animate-slide-in"
            onClick={e => e.stopPropagation()}
          >
            <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-12rem)]">
              {navGroups.map((group, gi) => (
                <div key={gi}>
                  {group.label && (
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 mt-3 mb-1">
                      {group.label}
                    </p>
                  )}
                  {group.items.map(({ path, label, icon: Icon }) => {
                    const isActive = location.pathname === path;
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`nav-link ${isActive ? "active" : ""}`}
                      >
                        <Icon className="w-5 h-5" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            
            <div className="absolute bottom-16 left-4 right-4">
              <InstallButton variant="nav" />
            </div>

            <div className="absolute bottom-4 left-4 right-4">
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Abmelden
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-2 flex justify-around items-center z-50 md:hidden backdrop-blur-lg bg-white/90">
        {navItems.slice(0, 5).map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path || 
            (path !== "/dashboard" && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
                isActive ? "text-emerald-600" : "text-[var(--text-muted)]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="md:ml-64 pt-16 pb-20 md:pt-0 md:pb-0 min-h-screen">
        <div className="p-6 md:p-8 lg:p-12">
          {children}
        </div>
      </main>

      {/* PWA Install Prompt */}
      <InstallPrompt />

      {/* PWA Update Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-emerald-600 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4 flex-shrink-0" />
            <span>Neue Version verfügbar!</span>
          </div>
          <button
            onClick={handleApplyUpdate}
            className="flex-shrink-0 bg-white text-emerald-700 text-xs font-semibold px-3 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Jetzt aktualisieren
          </button>
        </div>
      )}
    </div>
  );
};

export default Layout;
