import { AuthForm } from "@/components/auth-form";
import { Brain, Shield, Clock } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      
      <main className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full px-6 py-12 md:py-24 gap-12 lg:gap-24 relative z-10">
        <div className="flex-1 flex flex-col justify-center space-y-8">
          <div className="space-y-4">
            <h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-tight">
              见微 <br />
              <span className="text-primary text-3xl md:text-5xl mt-2 block">社会情境认知训练器</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
              重要沟通前，厘清事实、准备一个关键问题；沟通后，用实际结果修正判断。
            </p>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-2 rounded-sm text-primary mt-1">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">先准备这一次沟通</h3>
                <p className="text-muted-foreground">分开你报告的事实、推断和未知，带走一个确认问题和一个可观察信号。</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-2 rounded-sm text-primary mt-1">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">再用结果修正</h3>
                <p className="text-muted-foreground">需要验证时，只锁定一条可观察预测。未知结果单独保留，不冒充已经验证。</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-2 rounded-sm text-primary mt-1">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">私人思考空间</h3>
                <p className="text-muted-foreground">没有社交互动，没有公开分享。这是您打磨心智的专属练习场。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center md:justify-end mt-12 md:mt-0">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent -m-6 blur-2xl rounded-full pointer-events-none" />
            <AuthForm />
          </div>
        </div>
      </main>

      <footer className="border-t border-border mt-auto py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} 见微 (Jianwei).</p>
          <div className="flex items-center gap-6">
            <span>隐私第一，无社交元素</span>
            <span>AI 辅助仅在明确授权后开启</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
