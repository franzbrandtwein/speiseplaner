import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "./ui/button";
import { 
  ChefHat, LayoutDashboard, BookOpen, Calendar, ShoppingCart, 
  LogOut, Menu, X, User, Sparkles, Users, RefreshCw
} from "lucide-react";
import InstallPrompt from "./InstallPrompt";
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

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/recipes", label: "Rezepte", icon: BookOpen },
    { path: "/ingredient-search", label: "Was kochen?", icon: Sparkles },
    { path: "/meal-planner", label: "Speiseplan", icon: Calendar },
    { path: "/shopping-list", label: "Einkaufsliste", icon: ShoppingCart },
    { path: "/group", label: "Gruppe", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-default)]">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 p-6 flex-col gap-2 z-50 hidden md:flex">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <span className="font-heading text-xl font-bold text-[var(--text-primary)]">
            Kochplaner
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => {
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
        </nav>

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
            <nav className="space-y-1">
              {navItems.map(({ path, label, icon: Icon }) => {
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
            </nav>
            
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
        {navItems.map(({ path, label, icon: Icon }) => {
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
    </div>
  );
};

export default Layout;
