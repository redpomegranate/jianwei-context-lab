import { useListEvents, useDeleteEvent, getListEventsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { Search, Filter, Loader2, Calendar, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { EventCategory, EventStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<string, string> = {
  work: "工作",
  relationship: "人际",
  family: "家庭",
  other: "其他"
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  analyzing: "分析中",
  predicted: "待复盘",
  completed: "已确认反思"
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  analyzing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  predicted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
};

export default function EventsHistory() {
  const { data: events, isLoading } = useListEvents();
  const removeEvent = useDeleteEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(event => {
      const matchSearch = search === "" || event.title.toLowerCase().includes(search.toLowerCase()) || event.rawText.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || event.status === statusFilter;
      const matchCategory = categoryFilter === "all" || event.category === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [events, search, statusFilter, categoryFilter]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif font-bold tracking-tight">情境档案</h1>
        <p className="text-muted-foreground">检索您过去记录的社会情境，检视认知轨迹。</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-sm border border-card-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="搜索标题或内容..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              {Object.entries(EventStatus).map(([k, v]) => (
                <SelectItem key={v} value={v}>{STATUS_LABELS[v]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有分类</SelectItem>
              {Object.entries(EventCategory).map(([k, v]) => (
                <SelectItem key={v} value={v}>{CATEGORY_LABELS[v]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-24 bg-card/50 rounded-sm border border-dashed border-border">
          <Filter className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">暂无记录</h3>
          <p className="text-sm text-muted-foreground mt-1">
            没有找到匹配的情境档案。
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEvents.map(event => (
            <Card key={event.id} className="hover-elevate transition-colors hover:border-primary/30">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <Link href={`/events/${event.id}`} className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif font-semibold text-lg line-clamp-1">{event.title}</h3>
                        <Badge variant="outline" className="text-[10px] font-normal px-1.5 h-5 rounded">
                          {CATEGORY_LABELS[event.category]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 pr-4">
                        {event.rawText}
                      </p>
                    </Link>
                    <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0 md:w-32">
                      <Badge variant="secondary" className={`border-none ${STATUS_COLORS[event.status]}`}>
                        {STATUS_LABELS[event.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(event.createdAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={removeEvent.isPending}
                        onClick={() => {
                          if (!window.confirm(`删除「${event.title}」？预测、结果和反思会一起移除。`)) return;
                          removeEvent.mutate({ id: event.id }, {
                            onSuccess: () => {
                              toast({ title: "记录已删除" });
                              queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                            },
                            onError: (deleteError: unknown) => {
                              const message = deleteError instanceof Error ? deleteError.message : "删除失败";
                              toast({ variant: "destructive", title: "删除失败", description: message });
                            },
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        删除
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
          ))}
        </div>
      )}
    </div>
  );
}