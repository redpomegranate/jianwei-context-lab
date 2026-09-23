import * as React from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

export function AuthForm() {
  const [isLogin, setIsLogin] = React.useState(true)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = getSupabase()
      
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        toast({
          title: "注册成功",
          description: "请检查您的邮箱完成验证。",
        })
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "认证失败",
        description: error.message || "发生未知错误，请重试。",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      toast({
        variant: "destructive",
        title: "请输入邮箱",
        description: "需要邮箱地址来发送重置链接。",
      })
      return
    }
    
    setIsLoading(true)
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email)
      if (error) throw error
      toast({
        title: "邮件已发送",
        description: "请检查您的邮箱获取密码重置链接。",
      })
    } catch (error: any) {
       toast({
        variant: "destructive",
        title: "发送失败",
        description: error.message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-[350px] shadow-lg border-primary/10">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center font-serif">
          {isLogin ? "登录" : "注册"}
        </CardTitle>
        <CardDescription className="text-center">
          进入您的个人思考空间
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密码</Label>
              {isLogin && (
                <Button 
                  type="button" 
                  variant="link" 
                  className="px-0 font-normal h-auto text-xs text-muted-foreground"
                  onClick={handleResetPassword}
                >
                  忘记密码？
                </Button>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLogin ? "登录" : "注册"}
          </Button>
          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "还没有账号？" : "已有账号？"}
            </span>{" "}
            <Button
              type="button"
              variant="link"
              className="p-0 h-auto"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "注册" : "登录"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
