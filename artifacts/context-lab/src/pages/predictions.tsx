import { useListPredictions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { Clock, CheckCircle, AlertTriangle, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export default function Predictions() {
  const { data: events, isLoading } = useListPredictions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const pendingPredictions = events?.filter(e => e.prediction && !e.prediction.outcome) || [];
  const completedPredictions = events?.filter(e => e.prediction && e.prediction.outcome) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif font-bold tracking-tight">预测池</h1>
        <p className="text-muted-foreground">跟踪已经锁定的预测。记录了结果还不等于完成反思；无法判断的结果会单独标出。</p>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="pending">
            等待揭晓 ({pendingPredictions.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            已记录结果 ({completedPredictions.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-6 space-y-4">
          {pendingPredictions.length === 0 ? (
            <div className="text-center py-16 bg-card/50 rounded-sm border border-dashed border-border">
              <Clock className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm">没有正在等待结果的预测。</p>
            </div>
          ) : (
            pendingPredictions.map(event => {
              const p = event.prediction!;
              const isOverdue = new Date(p.dueAt) < new Date();
              return (
                <Link key={event.id} href={`/events/${event.id}`}>
                  <Card className={`hover-elevate cursor-pointer transition-colors ${isOverdue ? 'border-amber-500/30 bg-amber-50/10 dark:bg-amber-950/10' : ''}`}>
                    <CardContent className="p-5 flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <h3 className="font-medium text-lg text-primary">{p.text}</h3>
                          {isOverdue && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                              <AlertCircle className="w-3 h-3 mr-1" /> 已到期
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          <span className="font-medium text-foreground/80">关联事件：</span> {event.title}
                        </p>
                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-sm border border-border/50">
                          <span className="font-medium">验证标准：</span> {p.criteria}
                        </div>
                      </div>
                      <div className="md:w-48 shrink-0 flex flex-col justify-center space-y-3 md:border-l md:border-border md:pl-6">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">主观概率</span>
                            <span className="font-medium">{p.probability}%</span>
                          </div>
                          <Progress value={p.probability} className="h-1.5" />
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center">
                          <Clock className="w-3 h-3 mr-1" /> 
                          {formatDate(p.dueAt)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
        </TabsContent>
        
        <TabsContent value="completed" className="mt-6 space-y-4">
          {completedPredictions.length === 0 ? (
            <div className="text-center py-16 bg-card/50 rounded-sm border border-dashed border-border">
              <CheckCircle className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm">还没有记录结果的预测。</p>
            </div>
          ) : (
            completedPredictions.map(event => {
              const p = event.prediction!;
              const o = p.outcome!;
              
              const outcomeColors = {
                occurred: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50",
                not_occurred: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50",
                unknown: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800"
              };
              
              const outcomeLabels = {
                occurred: "已发生",
                not_occurred: "未发生",
                unknown: "无法确认"
              };

              return (
                <Link key={event.id} href={`/events/${event.id}`}>
                  <Card className="hover-elevate cursor-pointer transition-colors opacity-80 hover:opacity-100">
                    <CardContent className="p-5 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <h3 className="font-medium text-foreground">{p.text}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            源自: {event.title}
                          </p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 ${outcomeColors[o.result]}`}>
                          {outcomeLabels[o.result]}
                          {event.reflection ? " · 已确认反思" : " · 尚未反思"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-sm">
                        <div>
                          <span className="text-muted-foreground text-xs block mb-1">预测时概率</span>
                          <span className="font-medium">{p.probability}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block mb-1">事后笔记</span>
                          <span className="line-clamp-1" title={o.notes || "无"}>{o.notes || "无记录"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}