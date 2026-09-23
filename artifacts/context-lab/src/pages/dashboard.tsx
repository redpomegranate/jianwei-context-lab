import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { useCreateEvent, useGetSummary } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { useLocation } from "wouter"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { EventCategory } from "@workspace/api-client-react"
import { Loader2, PlusCircle, Activity, Archive, Clock, CheckCircle } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const eventSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题过长"),
  rawText: z.string().min(5, "描述过于简短，请提供更多细节").max(2000, "描述过长"),
  category: z.nativeEnum(EventCategory, { required_error: "请选择分类" }),
})

type EventFormValues = z.infer<typeof eventSchema>

const CATEGORY_LABELS: Record<string, string> = {
  work: "工作",
  relationship: "人际",
  family: "家庭",
  other: "其他"
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data: summary, isLoading: summaryLoading } = useGetSummary()
  const createEvent = useCreateEvent()
  const { toast } = useToast()
  const [, setLocation] = useLocation()

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      rawText: "",
      category: EventCategory.work,
    },
  })

  const onSubmit = (data: EventFormValues) => {
    createEvent.mutate(
      { data },
      {
        onSuccess: (event) => {
          toast({ title: "捕获成功", description: "事件已保存至草稿。" })
          setLocation(`/events/${event.id}`)
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "保存失败",
            description: err.message || "无法保存事件。",
          })
        },
      }
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif font-bold tracking-tight">今日概览</h1>
        <p className="text-muted-foreground">欢迎回来。开始新的一天的认知训练。</p>
      </header>

      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => (
             <Card key={i} className="h-28 bg-muted/50 border-0" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/10">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-3xl font-serif font-semibold text-primary">{summary.totalEvents}</span>
              <span className="text-sm text-muted-foreground mt-1 flex items-center"><Archive className="w-3 h-3 mr-1"/> 总档案</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-3xl font-serif font-semibold">{summary.drafts}</span>
              <span className="text-sm text-muted-foreground mt-1 flex items-center"><Activity className="w-3 h-3 mr-1"/> 草稿</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-3xl font-serif font-semibold text-amber-600 dark:text-amber-500">{summary.duePredictions}</span>
              <span className="text-sm text-muted-foreground mt-1 flex items-center"><Clock className="w-3 h-3 mr-1"/> 待记录结果</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-3xl font-serif font-semibold text-green-600 dark:text-green-500">{summary.completedLoops}</span>
              <span className="text-sm text-muted-foreground mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> 有效验证</span>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {summary && (
        <p className="text-sm text-muted-foreground">
          已记录结果 {summary.recordedOutcomes}，其中无法判断 {summary.unknownOutcomes}。已确认反思 {summary.confirmedReflections}。有效验证只计入锁定预测、可判定结果和你确认的反思。
        </p>
      )}

      <Card className="border-t-4 border-t-primary shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-serif">
            <PlusCircle className="mr-2 h-5 w-5 text-primary" />
            捕获新情境
          </CardTitle>
          <CardDescription>
            先记下这次重要沟通。下一步会分开事实和未知，并准备一个可以发出去的问题。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                   <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>简短标题</FormLabel>
                        <FormControl>
                          <Input placeholder="如：周会上的沉默" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                   <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>领域</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择分类" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(EventCategory).map(([key, value]) => (
                              <SelectItem key={value} value={value}>
                                {CATEGORY_LABELS[value] || value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <FormField
                control={form.control}
                name="rawText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>原始记录</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="客观描述发生的事情，不要加入评价或揣测..." 
                        className="min-h-[150px] resize-y"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createEvent.isPending} size="lg" className="w-full md:w-auto">
                  {createEvent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  记下并开始准备
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
