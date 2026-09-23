import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-serif font-bold text-primary">404</h1>
        <h2 className="text-2xl font-medium">页面未找到</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          您寻找的页面不存在或已被移除。
        </p>
        <div className="pt-6">
          <Link href="/">
            <Button>返回首页</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
