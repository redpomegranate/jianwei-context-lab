import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import { LogOut, ArrowLeft, Download, Shield, Settings2, Sparkles, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExportData, useGetConfig, useListRuns, getExportDataQueryKey } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch"; // Needs to be added if not present, falling back to a custom toggle if not installed
import { getSupabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_MODELS, CUSTOM_MODEL, defaultAiSettings, useAiSettings, type AiSettings } from "@/lib/ai-settings";
import { listRunUsage, readRunUsage, tokenUsageEventName, type RunTokenUsage } from "@/lib/run-usage";
import { useEffect } from "react";

export default function Settings() {
  const { user, signOut, aiEnabled } = useAuth();
  const { data: config } = useGetConfig();
  const { data: runs, isLoading: runsLoading } = useListRuns();
  const recordedUsage = useRecordedRunUsage();
  const exportDataQuery = useExportData({ query: { enabled: false, queryKey: getExportDataQueryKey() } });
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ variant: "destructive", title: "密码无效", description: "密码至少需要 6 个字符。" });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "密码更新成功" });
      setNewPassword("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "密码更新失败", description: err.message });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportDataQuery.refetch();
      if (result.isError) throw result.error;
      const data = result.data;
      if (!data) throw new Error("无数据返回");

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `context-lab-export-${formatDate(new Date()).replace(/[\s:]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const revisions = Array.isArray((data as { revisions?: unknown[] }).revisions)
        ? (data as { revisions: unknown[] }).revisions.length
        : 0;
      toast({
        title: "导出完成",
        description: `事件 ${data.events.length} 条，运行记录 ${data.runs.length} 条，修订 ${revisions} 条。`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "导出失败", description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <header className="space-y-2 pt-4">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="md:hidden">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-serif font-bold tracking-tight">设置</h1>
        </div>
        <p className="text-muted-foreground pl-10 md:pl-0">管理您的账户、数据隐私和 AI 选项。</p>
      </header>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="mr-2 h-5 w-5 text-primary" /> 
              账户与隐私
            </CardTitle>
            <CardDescription>
              当前登录邮箱: {user?.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="rounded-sm border border-border p-4 bg-muted/30 mb-4">
               <h4 className="font-medium text-sm mb-2">修改密码</h4>
               <div className="flex gap-2">
                 <Input 
                   type="password" 
                   placeholder="新密码 (最少 6 个字符)" 
                   value={newPassword}
                   onChange={e => setNewPassword(e.target.value)}
                   className="max-w-sm"
                 />
                 <Button onClick={handleUpdatePassword} disabled={isUpdatingPassword || !newPassword}>
                   修改
                 </Button>
               </div>
             </div>

             <div className="rounded-sm border border-border p-4 bg-muted/30">
               <h4 className="font-medium text-sm mb-2">数据控制</h4>
               <p className="text-sm text-muted-foreground mb-4">
                 你的事件、预测和反思只对你可见。导出会按页取完事件、运行记录和修订。单条记录可以在档案或事件页删除。
               </p>
               <Button onClick={handleExport} disabled={isExporting} variant="outline">
                 <Download className="mr-2 h-4 w-4" />
                 {isExporting ? "正在导出..." : "导出我的所有数据 (JSON)"}
               </Button>
             </div>
          </CardContent>
          <CardFooter className="border-t border-border pt-6">
            <Button variant="destructive" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </Button>
          </CardFooter>
        </Card>

        <ModelConnectionCard serverEnabled={aiEnabled} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Sparkles className="mr-2 h-5 w-5 text-primary" />
              AI 认知辅助
            </CardTitle>
            <CardDescription>
              智能分析代理状态与历史记录
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-border rounded-sm">
              <div className="space-y-1">
                <h4 className="font-medium text-sm">全局服务状态</h4>
                <p className="text-sm text-muted-foreground">服务器是否启用了 AI 辅助推理</p>
              </div>
              <Badge variant={aiEnabled ? "default" : "secondary"}>
                {aiEnabled ? "已启用" : "未启用"}
              </Badge>
            </div>

            {aiEnabled && (
              <div className="pt-4">
                <h4 className="font-medium text-sm flex items-center mb-4">
                  <Activity className="mr-2 h-4 w-4" />
                  推理运行历史
                </h4>
                {runs && runs.length > 0 && (
                  <TokenTotal runs={runs} recorded={recordedUsage} />
                )}
                
                {runsLoading ? (
                  <div className="text-sm text-muted-foreground p-4 text-center">加载中...</div>
                ) : !runs || runs.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-sm">
                    尚无 AI 分析记录。
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {runs.slice(0, 10).map(run => (
                      <AccordionItem key={run.id} value={run.id}>
                        <AccordionTrigger className="hover:no-underline px-4 py-2 hover:bg-muted/50 rounded-sm">
                          <div className="flex items-center justify-between w-full pr-4">
                            <span className="text-sm font-medium">{formatDate(run.createdAt)}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{run.stage}</Badge>
                              <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                                {run.status}
                              </Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pt-2 pb-4 text-xs space-y-2 bg-muted/20 border-t border-border/50">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-muted-foreground">关联事件ID:</span> {run.eventId.slice(0, 8)}...</div>
                            <div><span className="text-muted-foreground">模型:</span> {run.model}</div>
                            <div><span className="text-muted-foreground">提示版本:</span> {run.promptVersion}</div>
                            <TokenLine usage={recordedUsage[run.id]} />
                            {run.finishedAt && <div><span className="text-muted-foreground">耗时:</span> {((new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()) / 1000).toFixed(1)}s</div>}
                            {run.errorCode && <div className="col-span-2 text-destructive"><span className="font-medium">错误:</span> {run.errorCode}</div>}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
                {runs && runs.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center mt-4">仅显示最近 10 条记录</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function useRecordedRunUsage() {
  const [recorded, setRecorded] = useState<Record<string, RunTokenUsage>>({});
  useEffect(() => {
    const sync = () => setRecorded(listRunUsage());
    sync();
    window.addEventListener(tokenUsageEventName(), sync);
    return () => window.removeEventListener(tokenUsageEventName(), sync);
  }, []);
  return recorded;
}

function usageOf(runId: string, recorded: Record<string, RunTokenUsage>): RunTokenUsage | null {
  return recorded[runId] ?? readRunUsage(runId);
}

function TokenTotal({ runs, recorded }: { runs: { id: string }[]; recorded: Record<string, RunTokenUsage> }) {
  const known = runs.flatMap((run) => {
    const usage = usageOf(run.id, recorded);
    return usage ? [usage] : [];
  });
  const total = known.reduce((sum, usage) => sum + usage.totalTokens, 0);
  const missing = runs.length - known.length;
  return (
    <div className="mb-4 rounded-sm border border-border bg-muted/30 p-3 text-sm">
      <div className="font-medium">消耗 token 总量 {total.toLocaleString("zh-CN")}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        已计入 {known.length} 次有用量的运行。
        {missing > 0 ? ` 另外 ${missing} 次较早的运行没有记录用量。` : ""}
      </p>
    </div>
  );
}

function TokenLine({ usage }: { usage: RunTokenUsage | undefined }) {
  if (!usage) {
    return <div className="col-span-2"><span className="text-muted-foreground">token：</span>未记录</div>;
  }
  return (
    <div className="col-span-2">
      <span className="text-muted-foreground">token：</span>
      输入 {usage.promptTokens.toLocaleString("zh-CN")}
      {" · "}
      输出 {usage.completionTokens.toLocaleString("zh-CN")}
      {" · "}
      合计 {usage.totalTokens.toLocaleString("zh-CN")}
    </div>
  );
}

function ModelConnectionCard({ serverEnabled }: { serverEnabled: boolean }) {
  const { settings, save } = useAiSettings();
  const { toast } = useToast();
  const knownModel = AI_MODELS.some((item) => item.id === settings.model);
  const [modelChoice, setModelChoice] = useState(knownModel ? settings.model : CUSTOM_MODEL);
  const [customModel, setCustomModel] = useState(knownModel ? "" : settings.model);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const known = AI_MODELS.some((item) => item.id === settings.model);
    setModelChoice(known ? settings.model : CUSTOM_MODEL);
    setCustomModel(known ? "" : settings.model);
    setApiKey(settings.apiKey);
    setBaseUrl(settings.baseUrl);
  }, [settings]);

  const saveSettings = () => {
    const model = (modelChoice === CUSTOM_MODEL ? customModel : modelChoice).trim();
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(model)) {
      toast({ variant: "destructive", title: "模型名称无效", description: "只使用字母、数字、点、下划线、冒号和连字符。" });
      return;
    }
    const nextUrl = baseUrl.trim() || defaultAiSettings.baseUrl;
    try {
      const url = new URL(nextUrl);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
        throw new Error("unsupported");
      }
    } catch {
      toast({ variant: "destructive", title: "接口地址无效", description: "请使用 https 地址，或本机的 http://127.0.0.1。" });
      return;
    }
    const next: AiSettings = { apiKey: apiKey.trim(), baseUrl: nextUrl, model };
    save(next);
    toast({ title: "已保存在这台浏览器", description: "下次分析会使用这里的模型和密钥。密钥不会写入事件记录。" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings2 className="mr-2 h-5 w-5 text-primary" />
          模型连接
        </CardTitle>
        <CardDescription>
          填写 API 密钥并选择模型。留空密钥时，使用服务器上已经配置的 DeepSeek。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>模型</Label>
          <Select value={modelChoice} onValueChange={setModelChoice}>
            <SelectTrigger>
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_MODEL}>自定义模型名</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {AI_MODELS.find((item) => item.id === modelChoice)?.detail ?? "填写服务商文档中的模型 ID。"}
          </p>
        </div>
        {modelChoice === CUSTOM_MODEL && (
          <div className="grid gap-2">
            <Label htmlFor="custom-model">自定义模型</Label>
            <Input id="custom-model" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="例如 deepseek-v4-pro" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="ai-base-url">接口地址</Label>
          <Input id="ai-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com" />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-api-key">API 密钥</Label>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setShowKey((current) => !current)}>
              {showKey ? "隐藏" : "显示"}
            </Button>
          </div>
          <Input
            id="ai-api-key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={serverEnabled ? "留空则使用服务器密钥" : "必填，否则无法请求模型"}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {apiKey.trim() ? "将使用本机保存的密钥。" : serverEnabled ? "当前会使用服务器密钥。" : "服务器没有配置密钥，需要在这里填写。"}
          密钥只存在这台浏览器，分析时随请求发给你的服务器，不写入数据库。
        </p>
      </CardContent>
      <CardFooter className="border-t border-border pt-6">
        <Button onClick={saveSettings}>保存模型设置</Button>
      </CardFooter>
    </Card>
  );
}