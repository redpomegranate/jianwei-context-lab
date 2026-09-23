import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation } from "wouter";
import { LogOut, Menu, UserCircle, BookOpen, Clock, Activity, Settings, Loader2 } from "lucide-react";
import { useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "捕获", icon: Activity },
  { href: "/events", label: "档案", icon: BookOpen },
  { href: "/predictions", label: "预测", icon: Clock },
];

export function Sidebar() {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const { sidebarOpen, setSidebarOpen } = useAppState();

  const handleSignOut = async () => {
    await signOut();
  };

  if (!user) return null;

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-card-border transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-card-border">
          <Link href="/">
            <h1 className="font-serif text-xl font-bold tracking-wider text-primary cursor-pointer">
              见微
            </h1>
          </Link>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors cursor-pointer",
                location === item.href || (location.startsWith(item.href) && item.href !== "/") 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t border-card-border">
          <div className="flex items-center justify-between">
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4 mr-2" />
                设置
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="退出登录" className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
