import { useGetEvent, useDeleteEvent, updateEvent, analyzeEvent, submitPrediction, recordOutcome, saveReflection, EventStatus, Event, Hypothesis, AnalysisResult, AnalysisStage, getGetEventQueryKey, getListEventsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { aiAnalyzeFields, useAiSettings } from "@/lib/ai-settings";
import { rememberRunUsage } from "@/lib/run-usage";
import { Loader2, ArrowLeft, Brain, Save, AlertTriangle, Lock, Edit3, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { v4 as uuidv4 } from "uuid";
import { formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { addDays, formatISO } from "date-fns";

type OutcomeChoice = "" | "occurred" | "not_occurred" | "unknown";
type SaveState = "saved" | "saving" | "dirty" | "error";

interface DraftForm {
  title: string;
  rawText: string;
  facts: string;
  inferences: string;
  unknowns: string;
  questions: string;
  signal: string;
  userHypothesis: string;
  hypotheses: Hypothesis[];
  predictionText: string;
  probability: string;
  criteria: string;
  dueDays: string;
}

interface FrozenAnalyze {
  stage: AnalysisStage;
  requestId: string;
  version: number;
  fingerprint: string;
}

interface FrozenPredict {
  requestId: string;
  version: number;
  dueAt: string;
  fingerprint: string;
}

const stageLabels: Record<AnalysisStage, string> = {
  organize: "整理",
  hypotheses: "备选解释",
  prediction: "预测",
  reflection: "反思",
};

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function mergeLines(current: string, incoming: string[], max = 30): string {
  const next = lines(current);
  const seen = new Set(next);
  for (const item of incoming) {
    const text = item.trim();
    if (!text || seen.has(text) || next.length >= max) continue;
    seen.add(text);
    next.push(text);
  }
  return next.join("\n");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "请求没有完成";
}

function draftStorageKey(eventId: string) {
  return `context-lab-draft:${eventId}`;
}

function eventForm(event: Event): DraftForm {
  return {
    title: event.title,
    rawText: event.rawText,
    facts: event.facts.join("\n"),
    inferences: event.inferences.join("\n"),
    unknowns: event.unknowns.join("\n"),
    questions: (event.questions ?? []).join("\n"),
    signal: event.context ?? "",
    userHypothesis: event.userHypothesis || "",
    hypotheses: event.hypotheses ?? [],
    predictionText: "",
    probability: "",
    criteria: "",
    dueDays: "7",
  };
}

function readDraft(eventId: string): DraftForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftForm>;
    if (!parsed || typeof parsed.title !== "string") return null;
    return {
      ...eventForm({
        title: "",
        rawText: "",
        facts: [],
        inferences: [],
        unknowns: [],
        questions: [],
        context: "",
        userHypothesis: "",
        hypotheses: [],
      } as unknown as Event),
      ...parsed,
      hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
    };
  } catch {
    return null;
  }
}

function writeDraft(eventId: string, form: DraftForm) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftStorageKey(eventId), JSON.stringify(form));
}

function clearDraft(eventId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftStorageKey(eventId));
}

export default function EventWorkflow() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { aiEnabled } = useAuth();
  const queryClient = useQueryClient();
  const removeEvent = useDeleteEvent();

  const { data: event, isLoading: eventLoading, error } = useGetEvent(id || "");

  if (!id) {
    return <div>无效的事件ID</div>;
  }

  if (error) {
    return (
      <div className="text-center py-24 text-destructive space-y-4">
        <AlertTriangle className="mx-auto h-12 w-12 opacity-80" />
        <h2 className="text-xl font-medium">无法加载事件</h2>
        <Button variant="outline" onClick={() => setLocation("/events")}>返回列表</Button>
      </div>
    );
  }

  if (eventLoading || !event) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
  };

  const handleDelete = () => {
    if (!window.confirm("删除后，这件情境的预测、结果和反思会一起移除，且不能从这里恢复。要删除吗？")) return;
    removeEvent.mutate({ id }, {
      onSuccess: () => {
        clearDraft(id);
        toast({ title: "记录已删除" });
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        setLocation("/events");
      },
      onError: (deleteError: unknown) => toast({ variant: "destructive", title: "删除失败", description: errorText(deleteError) }),
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <header className="flex items-center gap-4 pt-4 border-b border-border pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/events")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-serif font-bold tracking-tight line-clamp-1">{event.title}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{event.category}</Badge>
            <Badge variant="secondary">{event.status}</Badge>
          </div>
        </div>
        <Button variant="ghost" className="text-destructive" onClick={handleDelete} disabled={removeEvent.isPending}>
          <Trash2 className="h-4 w-4 mr-2" />
          删除
        </Button>
      </header>

      <div className="bg-muted/30 p-4 rounded-sm border border-border/50 text-sm">
        <h4 className="font-medium mb-1 text-muted-foreground">你写下的原始记录</h4>
        <p className="whitespace-pre-wrap">{event.rawText}</p>
      </div>

      {(event.status === EventStatus.draft || event.status === EventStatus.analyzing) && (
        <DraftStage event={event} aiEnabled={aiEnabled} onUpdate={refresh} />
      )}

      {event.status === EventStatus.predicted && !event.prediction?.outcome && (
        <PredictedStage event={event} onUpdate={refresh} />
      )}

      {(event.status === EventStatus.completed || (event.status === EventStatus.predicted && !!event.prediction?.outcome)) && (
        <CompletedStage event={event} aiEnabled={aiEnabled} onUpdate={refresh} />
      )}
    </div>
  );
}

function DraftStage({ event, aiEnabled, onUpdate }: { event: Event; aiEnabled: boolean; onUpdate: () => void }) {
  const initial = useRef<{ form: DraftForm; restored: boolean } | null>(null);
  if (!initial.current) {
    const serverForm = eventForm(event);
    const stored = readDraft(event.id);
    const restored = Boolean(stored && JSON.stringify(stored) !== JSON.stringify(serverForm));
    initial.current = { form: restored && stored ? stored : serverForm, restored };
  }
  const form = initial.current.form;

  const [title, setTitle] = useState(form.title);
  const [rawText, setRawText] = useState(form.rawText);
  const [facts, setFacts] = useState(form.facts);
  const [inferences, setInferences] = useState(form.inferences);
  const [unknowns, setUnknowns] = useState(form.unknowns);
  const [questions, setQuestions] = useState(form.questions);
  const [signal, setSignal] = useState(form.signal);
  const [userHypothesis, setUserHypothesis] = useState(form.userHypothesis);
  const [manualHypotheses, setManualHypotheses] = useState<Hypothesis[]>(form.hypotheses);
  const [predictionText, setPredictionText] = useState(form.predictionText);
  const [probability, setProbability] = useState<string>(form.probability);
  const [criteria, setCriteria] = useState(form.criteria);
  const [dueDays, setDueDays] = useState(form.dueDays);
  const [aiConsent, setAiConsent] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(initial.current.restored ? "dirty" : "saved");
  const [aiCandidates, setAiCandidates] = useState<AnalysisResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const versionRef = useRef(event.version);
  const savedFingerprint = useRef("");
  const saveKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const tail = useRef(Promise.resolve());
  const analyzeFrozen = useRef<FrozenAnalyze | null>(null);
  const predictFrozen = useRef<FrozenPredict | null>(null);
  const announcedRestore = useRef(false);
  const { toast } = useToast();
  const { settings: aiSettings } = useAiSettings();
  const canAskAi = aiEnabled || aiSettings.apiKey.trim().length > 0;

  const currentForm = useCallback((): DraftForm => ({
    title, rawText, facts, inferences, unknowns, questions, signal, userHypothesis,
    hypotheses: manualHypotheses, predictionText, probability, criteria, dueDays,
  }), [title, rawText, facts, inferences, unknowns, questions, signal, userHypothesis, manualHypotheses, predictionText, probability, criteria, dueDays]);

  const contentFingerprint = useCallback(() => JSON.stringify({
    title: title.trim(),
    rawText: rawText.trim(),
    facts: lines(facts),
    inferences: lines(inferences),
    unknowns: lines(unknowns),
    questions: lines(questions).slice(0, 3),
    signal,
    userHypothesis,
    hypotheses: manualHypotheses
      .map((item) => ({ text: item.text.trim(), evidence: item.evidence.trim(), missing: item.missing.trim() }))
      .filter((item) => item.text)
      .slice(0, 3),
  }), [title, rawText, facts, inferences, unknowns, questions, signal, userHypothesis, manualHypotheses]);

  if (!savedFingerprint.current) {
    const server = eventForm(event);
    savedFingerprint.current = JSON.stringify({
      title: server.title.trim(),
      rawText: server.rawText.trim(),
      facts: lines(server.facts),
      inferences: lines(server.inferences),
      unknowns: lines(server.unknowns),
      questions: lines(server.questions).slice(0, 3),
      signal: server.signal,
      userHypothesis: server.userHypothesis,
      hypotheses: server.hypotheses.slice(0, 3),
    });
  }

  useEffect(() => {
    if (announcedRestore.current || !initial.current?.restored) return;
    announcedRestore.current = true;
    toast({ title: "已恢复尚未保存的草稿", description: "离开页面前的内容还在，保存后会写回这件记录。" });
  }, [toast]);

  useEffect(() => {
    writeDraft(event.id, currentForm());
  }, [event.id, currentForm]);

  useEffect(() => {
    if (contentFingerprint() !== savedFingerprint.current) setSaveState("dirty");
  }, [contentFingerprint]);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task, task);
    tail.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const persist = useCallback(async () => enqueue(async () => {
    const fingerprint = contentFingerprint();
    if (fingerprint === savedFingerprint.current) return;
    const content = JSON.parse(fingerprint) as {
      title: string;
      rawText: string;
      facts: string[];
      inferences: string[];
      unknowns: string[];
      questions: string[];
      signal: string;
      userHypothesis: string;
      hypotheses: Hypothesis[];
    };
    if (!content.title || !content.rawText) return;
    if (!saveKey.current || saveKey.current.fingerprint !== fingerprint) {
      saveKey.current = { fingerprint, key: uuidv4() };
    }
    setSaveState("saving");
    const updated = await updateEvent(event.id, {
      version: versionRef.current,
      title: content.title,
      rawText: content.rawText,
      facts: content.facts,
      inferences: content.inferences,
      unknowns: content.unknowns,
      questions: content.questions,
      context: content.signal,
      userHypothesis: content.userHypothesis,
      hypotheses: content.hypotheses,
    }, { headers: { "Idempotency-Key": saveKey.current.key } });
    versionRef.current = updated.version;
    savedFingerprint.current = fingerprint;
    setSaveState("saved");
  }), [contentFingerprint, enqueue, event.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void persist().catch(() => setSaveState("error"));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [persist]);

  const handleSaveDraft = async () => {
    try {
      await persist();
      toast({ title: "草稿已保存" });
      onUpdate();
    } catch (saveError) {
      setSaveState("error");
      toast({ variant: "destructive", title: "保存失败", description: `${errorText(saveError)} 再保存一次会重试同一次写入。` });
    }
  };

  const handleAnalyze = async (stage: AnalysisStage) => {
    if (!aiConsent) {
      toast({ variant: "destructive", title: "需要授权", description: "请求 AI 候选前，请确认同意发送这件记录。" });
      return;
    }
    if ((stage === "hypotheses" || stage === "prediction") && !userHypothesis.trim()) {
      toast({ variant: "destructive", title: "请先写下你的解释", description: "可以写“暂时不知道”。" });
      return;
    }
    setIsWorking(true);
    try {
      await persist();
      const fingerprint = `${contentFingerprint()}:${aiSettings.model}:${aiSettings.baseUrl}:${aiSettings.apiKey}`;
      const frozen = analyzeFrozen.current;
      if (!frozen || frozen.stage !== stage || frozen.fingerprint !== fingerprint) {
        analyzeFrozen.current = {
          stage,
          requestId: uuidv4(),
          version: versionRef.current,
          fingerprint,
        };
      }
      const operation = analyzeFrozen.current;
      const result = await analyzeEvent(event.id, {
        version: operation.version,
        requestId: operation.requestId,
        stage,
        consent: true,
        ...aiAnalyzeFields(aiSettings),
      });
      analyzeFrozen.current = null;
      rememberRunUsage(result.runId, result.usage);
      setAiCandidates(result);
      toast({ title: "候选已返回", description: "这是待你确认的内容，还没有写入记录。" });
    } catch (analyzeError) {
      toast({
        variant: "destructive",
        title: "这次分析没有确认完成",
        description: `${errorText(analyzeError)} 内容不变时，再按一次会重试同一次请求。`,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const adoptOrganize = (result: AnalysisResult) => {
    setFacts((current) => mergeLines(current, result.facts));
    setInferences((current) => mergeLines(current, result.inferences));
    setUnknowns((current) => mergeLines(current, result.unknowns));
    setQuestions((current) => mergeLines(current, result.questions, 3));
    toast({ title: "已放入记录", description: "请再看一遍。这些仍是你报告的内容，不是已证实的事实。" });
  };

  const adoptHypothesis = (item: Hypothesis) => {
    if (manualHypotheses.length >= 3) {
      toast({ variant: "destructive", title: "最多保留 3 个解释" });
      return;
    }
    setManualHypotheses((current) => [...current, item]);
    toast({ title: "已采纳为你的备选解释" });
  };

  const handleSubmitPrediction = async () => {
    if (!predictionText.trim() || !criteria.trim()) {
      toast({ variant: "destructive", title: "预测和验证标准都要填写" });
      return;
    }
    const probValue = Number(probability);
    if (!Number.isInteger(probValue) || probValue < 0 || probValue > 100 || probability === "") {
      toast({ variant: "destructive", title: "概率需要是 0 到 100 的整数" });
      return;
    }
    setIsWorking(true);
    try {
      await persist();
      const fingerprint = JSON.stringify({
        draft: contentFingerprint(),
        predictionText: predictionText.trim(),
        probability: probValue,
        criteria: criteria.trim(),
        dueDays,
      });
      if (!predictFrozen.current || predictFrozen.current.fingerprint !== fingerprint) {
        const days = Number.parseInt(dueDays, 10);
        predictFrozen.current = {
          requestId: uuidv4(),
          version: versionRef.current,
          dueAt: formatISO(addDays(new Date(), Number.isInteger(days) ? days : 7)),
          fingerprint,
        };
      }
      const operation = predictFrozen.current;
      await submitPrediction(event.id, {
        version: operation.version,
        requestId: operation.requestId,
        text: predictionText.trim(),
        probability: probValue,
        criteria: criteria.trim(),
        dueAt: operation.dueAt,
      });
      predictFrozen.current = null;
      clearDraft(event.id);
      toast({ title: "预测已锁定" });
      onUpdate();
    } catch (predictError) {
      toast({
        variant: "destructive",
        title: "锁定没有确认完成",
        description: `${errorText(predictError)} 内容不变时，再按一次会使用同一个截止时间重试。`,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const saveLabel = {
    saved: "已保存，可以离开",
    saving: "正在保存",
    dirty: "有未保存的修改",
    error: "自动保存失败，请再保存一次",
  }[saveState];

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <CardTitle className="text-xl font-serif flex items-center">
            <Edit3 className="w-5 h-5 mr-2" /> 这次沟通
          </CardTitle>
          <CardDescription>先分开你报告的事实、推断和未知。准备好一个问题和一个信号，就可以离开。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>简短标题</Label>
              <Input value={title} onChange={(input) => setTitle(input.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>原始记录</Label>
              <Textarea value={rawText} onChange={(input) => setRawText(input.target.value)} className="min-h-[100px]" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>你报告的事实（每行一条）</Label>
              <Textarea value={facts} onChange={(input) => setFacts(input.target.value)} placeholder="例：周五的会上，对方没有确认谁负责交付" className="min-h-[120px]" />
              <p className="text-xs text-muted-foreground">这是你写下的观察，不是已经证实的客观结论。</p>
            </div>
            <div className="space-y-2">
              <Label>你的推断（每行一条）</Label>
              <Textarea value={inferences} onChange={(input) => setInferences(input.target.value)} placeholder="例：对方可能还不想承诺" className="min-h-[120px]" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>还不知道的信息（每行一条）</Label>
            <Textarea value={unknowns} onChange={(input) => setUnknowns(input.target.value)} placeholder="例：谁负责、什么时候交付，对方还没有说" />
          </div>
          <div className="space-y-2 pt-4 border-t border-border">
            <Label className="text-base font-semibold">你的初步解释</Label>
            <p className="text-sm text-muted-foreground">先写你自己的解释。没有头绪时，写“暂时不知道”。</p>
            <Textarea value={userHypothesis} onChange={(input) => setUserHypothesis(input.target.value)} placeholder="我目前的解释是……" className="min-h-[100px] border-primary/20 bg-primary/5" />
          </div>

          <div className="space-y-4 p-4 border border-primary/20 bg-primary/5 rounded-sm">
            <div>
              <Label className="text-base font-semibold">下次沟通要带走的一张卡</Label>
              <p className="text-sm text-muted-foreground mt-1">一个可以发出去的问题，一个你下次能看见的信号。这就是这次可以使用的结果。</p>
            </div>
            <div className="space-y-2">
              <Label>要确认的问题（最多 3 条，第一行是这次要问的）</Label>
              <Textarea value={questions} onChange={(input) => setQuestions(input.target.value)} placeholder="例：周五前，你是否明确回复我负责的交付项？" />
            </div>
            <div className="space-y-2">
              <Label>要观察的一个信号</Label>
              <Input value={signal} onChange={(input) => setSignal(input.target.value)} placeholder="例：对方是否写出负责人、交付物和日期" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-base font-semibold">你保留的备选解释</Label>
                <p className="text-xs text-muted-foreground mt-1">解释不必互斥。尚缺信息不是已经看到的反证。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setManualHypotheses((current) => current.length >= 3 ? current : [...current, { text: "", evidence: "", missing: "" }])}>添加解释</Button>
            </div>
            {manualHypotheses.map((item, index) => (
              <div key={index} className="space-y-3 p-4 bg-muted/30 border border-border rounded-sm relative">
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-muted-foreground" onClick={() => setManualHypotheses((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="space-y-1">
                  <Label className="text-xs">解释</Label>
                  <Input value={item.text} onChange={(input) => setManualHypotheses((current) => current.map((hypothesis, itemIndex) => itemIndex === index ? { ...hypothesis, text: input.target.value } : hypothesis))} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">你引用的描述</Label>
                    <Input value={item.evidence} onChange={(input) => setManualHypotheses((current) => current.map((hypothesis, itemIndex) => itemIndex === index ? { ...hypothesis, evidence: input.target.value } : hypothesis))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">尚缺信息</Label>
                    <Input value={item.missing} placeholder="还需要确认什么" onChange={(input) => setManualHypotheses((current) => current.map((hypothesis, itemIndex) => itemIndex === index ? { ...hypothesis, missing: input.target.value } : hypothesis))} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4">
            <div className="space-y-2">
              <Button variant="secondary" onClick={handleSaveDraft} disabled={isWorking || saveState === "saving"}>
                {saveState === "saving" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                保存草稿
              </Button>
              <p className="text-xs text-muted-foreground">{saveLabel}</p>
            </div>
            {canAskAi && (
              <div className="flex flex-col items-stretch gap-3 w-full md:w-auto">
                <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-sm border border-border">
                  <Checkbox id="consent" checked={aiConsent} onCheckedChange={(checked) => setAiConsent(checked === true)} />
                  <Label htmlFor="consent" className="text-xs font-normal cursor-pointer">同意把这件记录发给模型，只取回待确认的候选</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    ["organize", "整理事实与未知"],
                    ["hypotheses", "备选解释"],
                    ["prediction", "预测候选"],
                  ] as const).map(([stage, label]) => (
                    <Button key={stage} variant="outline" onClick={() => handleAnalyze(stage)} disabled={isWorking}>
                      {isWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">反思候选要等你记录结果之后。四个阶段分开请求，空字段不会被当成结果。</p>
              </div>
            )}
          </div>

          {aiCandidates && <CandidatePanel result={aiCandidates} onAdoptOrganize={adoptOrganize} onAdoptHypothesis={adoptHypothesis} onAdoptPrediction={(text, nextCriteria) => { setPredictionText(text); if (nextCriteria) setCriteria(nextCriteria); }} />}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <CardTitle className="text-xl font-serif">需要验证时，再锁定一条预测</CardTitle>
          <CardDescription>上面的问题和信号已经是一次完整使用。只有当你想让现实纠正一个判断时，才锁定下面这一条。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label>可观察的预测</Label>
            <Textarea value={predictionText} onChange={(input) => setPredictionText(input.target.value)} placeholder="例：周五前，对方明确回复我负责的交付项" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>你现在的把握（0-100 的整数）</Label>
              <Input type="number" min={0} max={100} value={probability} onChange={(input) => setProbability(input.target.value)} placeholder="例如 60" />
            </div>
            <div className="space-y-2">
              <Label>观察期限</Label>
              <Select value={dueDays} onValueChange={setDueDays}>
                <SelectTrigger><SelectValue placeholder="选择期限" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">明天</SelectItem>
                  <SelectItem value="3">3 天后</SelectItem>
                  <SelectItem value="7">1 周后</SelectItem>
                  <SelectItem value="14">2 周后</SelectItem>
                  <SelectItem value="30">1 个月后</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>怎样算发生了</Label>
            <Textarea value={criteria} onChange={(input) => setCriteria(input.target.value)} placeholder="例：收到写明负责人和日期的回复" className="min-h-[100px]" />
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t border-border flex justify-end">
          <Button onClick={handleSubmitPrediction} disabled={isWorking || !userHypothesis.trim()}>
            {isWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            锁定这一条预测
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function CandidatePanel({
  result,
  onAdoptOrganize,
  onAdoptHypothesis,
  onAdoptPrediction,
}: {
  result: AnalysisResult;
  onAdoptOrganize: (result: AnalysisResult) => void;
  onAdoptHypothesis: (item: Hypothesis) => void;
  onAdoptPrediction: (text: string, criteria: string) => void;
}) {
  const organizeEmpty = result.facts.length + result.inferences.length + result.unknowns.length + result.questions.length === 0;
  return (
    <div className="mt-6 p-4 border border-primary/20 bg-primary/5 rounded-sm space-y-4">
      <h4 className="font-semibold flex items-center">
        <Sparkles className="w-4 h-4 mr-2" /> {stageLabels[result.stage]}候选，等待你确认
      </h4>
      <p className="text-sm text-muted-foreground">模型整理的内容不会自动成为事实。采纳之后你还可以改。</p>
      {result.stage === "organize" && (
        <div className="space-y-3 text-sm">
          {organizeEmpty ? <p>这一阶段没有新的候选。</p> : (
            <>
              <CandidateLines title="事实候选" items={result.facts} />
              <CandidateLines title="推断候选" items={result.inferences} />
              <CandidateLines title="未知候选" items={result.unknowns} />
              <CandidateLines title="问题候选" items={result.questions} />
              <Button variant="outline" size="sm" onClick={() => onAdoptOrganize(result)}>采纳到我的记录</Button>
            </>
          )}
        </div>
      )}
      {result.stage === "hypotheses" && (
        <div className="space-y-3">
          {result.hypotheses.length === 0 ? <p className="text-sm">这一阶段没有新的解释候选。</p> : result.hypotheses.map((item) => (
            <div key={item.text} className="flex justify-between items-start gap-4 p-3 bg-card border border-border rounded-sm">
              <div className="space-y-1 text-sm">
                <div className="font-medium">{item.text}</div>
                <div className="text-muted-foreground text-xs">引用的描述：{item.evidence || "无"}</div>
                <div className="text-muted-foreground text-xs">尚缺信息：{item.missing || "无"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onAdoptHypothesis(item)}>采纳</Button>
            </div>
          ))}
        </div>
      )}
      {result.stage === "prediction" && (
        result.predictionSuggestion ? (
          <div className="p-3 bg-card border border-border rounded-sm text-sm space-y-2">
            <div>{result.predictionSuggestion}</div>
            {result.criteriaSuggestion && <div className="text-muted-foreground text-xs">可观察标准：{result.criteriaSuggestion}</div>}
            <Button variant="outline" size="sm" onClick={() => onAdoptPrediction(result.predictionSuggestion, result.criteriaSuggestion)}>放入预测，先不锁定</Button>
          </div>
        ) : <p className="text-sm">这一阶段没有新的预测候选。</p>
      )}
    </div>
  );
}

function CandidateLines({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">{title}</div>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function PredictedStage({ event, onUpdate }: { event: Event; onUpdate: () => void }) {
  const prediction = event.prediction!;
  const [result, setResult] = useState<OutcomeChoice>("");
  const [notes, setNotes] = useState("");
  const [intervention, setIntervention] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const frozen = useRef<{ requestId: string; version: number; fingerprint: string } | null>(null);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!result) {
      toast({ variant: "destructive", title: "请先选择结果", description: "系统不会替你选“已发生”。" });
      return;
    }
    if (!notes.trim()) {
      toast({ variant: "destructive", title: "请写下你实际观察到的情况" });
      return;
    }
    const fingerprint = JSON.stringify({ result, notes: notes.trim(), intervention: intervention.trim(), version: event.version });
    if (!frozen.current || frozen.current.fingerprint !== fingerprint) {
      frozen.current = { requestId: uuidv4(), version: event.version, fingerprint };
    }
    setIsSubmitting(true);
    try {
      await recordOutcome(event.id, {
        version: frozen.current.version,
        requestId: frozen.current.requestId,
        result,
        notes: notes.trim(),
        intervention: intervention.trim(),
      });
      frozen.current = null;
      toast({ title: "结果已记录" });
      onUpdate();
    } catch (outcomeError) {
      toast({
        variant: "destructive",
        title: "结果没有确认写入",
        description: `${errorText(outcomeError)} 选项和说明不变时，再提交会重试同一次记录。`,
      });
      onUpdate();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg font-serif">已锁定的预测</CardTitle>
          <CardDescription>观察期限：{formatDate(prediction.dueAt)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-lg font-medium">{prediction.text}</div>
          <Badge variant="secondary" className="font-mono bg-background">锁定时的把握 {prediction.probability}%</Badge>
          <div className="text-sm bg-background p-3 rounded border border-border">
            <span className="font-medium">当时写下的标准：</span> {prediction.criteria}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-serif">记录实际结果</CardTitle>
          <CardDescription>请主动选择。未知是有效记录，但不会被算成一次可判定的验证。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={result} onValueChange={(value) => setResult(value as OutcomeChoice)} className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center space-x-2 border p-3 rounded-sm flex-1">
              <RadioGroupItem value="occurred" id="r-occurred" />
              <Label htmlFor="r-occurred" className="cursor-pointer">按标准发生了</Label>
            </div>
            <div className="flex items-center space-x-2 border p-3 rounded-sm flex-1">
              <RadioGroupItem value="not_occurred" id="r-not" />
              <Label htmlFor="r-not" className="cursor-pointer">按标准没有发生</Label>
            </div>
            <div className="flex items-center space-x-2 border p-3 rounded-sm flex-1">
              <RadioGroupItem value="unknown" id="r-unk" />
              <Label htmlFor="r-unk" className="cursor-pointer">无法判断</Label>
            </div>
          </RadioGroup>
          <div className="space-y-2">
            <Label>你观察到的情况</Label>
            <Textarea value={notes} onChange={(input) => setNotes(input.target.value)} placeholder="按当时的标准，实际看到了什么？" className="min-h-[100px]" />
          </div>
          <div className="space-y-2">
            <Label>你在期间采取的行动（选填）</Label>
            <Textarea value={intervention} onChange={(input) => setIntervention(input.target.value)} placeholder="如果是你先发问或催办，请写下来。结果不能直接解释成对方原本的动机。" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end bg-muted/10 border-t border-border">
          <Button onClick={handleSubmit} disabled={isSubmitting || !result || !notes.trim()}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            确认并记录结果
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function CompletedStage({ event, aiEnabled, onUpdate }: { event: Event; aiEnabled: boolean; onUpdate: () => void }) {
  const prediction = event.prediction!;
  const outcome = prediction.outcome!;
  const reflection = event.reflection;
  const corrections = event.reflectionCorrections ?? [];
  const [lesson, setLesson] = useState("");
  const [wellFounded, setWellFounded] = useState("");
  const [overreach, setOverreach] = useState("");
  const [missing, setMissing] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<AnalysisResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const analyzeFrozen = useRef<FrozenAnalyze | null>(null);
  const { toast } = useToast();
  const { settings: aiSettings } = useAiSettings();
  const canAskAi = aiEnabled || aiSettings.apiKey.trim().length > 0;

  const outcomeLabels = { occurred: "按标准发生了", not_occurred: "按标准没有发生", unknown: "无法判断" };

  const reflectionBody = () => ({
    lesson: lesson.trim(),
    wellFounded: wellFounded.trim(),
    overreach: overreach.trim(),
    missing: missing.trim(),
  });

  const handleSave = async () => {
    if (!reflectionBody().lesson) {
      toast({ variant: "destructive", title: "请用一句话写下你确认的教训" });
      return;
    }
    const fingerprint = JSON.stringify({ ...reflectionBody(), version: event.version });
    if (!saveKey.current || saveKey.current.fingerprint !== fingerprint) {
      saveKey.current = { fingerprint, key: uuidv4() };
    }
    setIsSubmitting(true);
    try {
      await saveReflection(event.id, {
        version: event.version,
        ...reflectionBody(),
      }, { headers: { "Idempotency-Key": saveKey.current.key } });
      toast({ title: "反思已确认", description: "原记录之后不能覆盖。若要修改，请追加更正。" });
      onUpdate();
    } catch (saveError) {
      toast({ variant: "destructive", title: "反思没有确认写入", description: `${errorText(saveError)} 内容不变时再保存会重试同一次。` });
      onUpdate();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCorrect = async () => {
    if (!reflectionBody().lesson) {
      toast({ variant: "destructive", title: "请写下这次更正" });
      return;
    }
    const fingerprint = JSON.stringify({ ...reflectionBody(), version: event.version });
    if (!saveKey.current || saveKey.current.fingerprint !== fingerprint) {
      saveKey.current = { fingerprint, key: uuidv4() };
    }
    setIsSubmitting(true);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("需要重新登录");
      const response = await fetch(`/api/events/${event.id}/reflection-corrections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": saveKey.current.key,
        },
        body: JSON.stringify({ version: event.version, ...reflectionBody() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "更正没有写入");
      }
      setLesson("");
      setWellFounded("");
      setOverreach("");
      setMissing("");
      saveKey.current = null;
      toast({ title: "已追加更正", description: "原来的反思还在，这条是你后来确认的版本。" });
      onUpdate();
    } catch (correctError) {
      toast({ variant: "destructive", title: "更正没有确认写入", description: `${errorText(correctError)} 内容不变时再提交会重试同一次。` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!aiConsent) {
      toast({ variant: "destructive", title: "需要授权" });
      return;
    }
    setIsSubmitting(true);
    try {
      const fingerprint = `reflection:${event.version}:${aiSettings.model}:${aiSettings.baseUrl}:${aiSettings.apiKey}`;
      if (!analyzeFrozen.current || analyzeFrozen.current.fingerprint !== fingerprint) {
        analyzeFrozen.current = { stage: "reflection", requestId: uuidv4(), version: event.version, fingerprint };
      }
      const operation = analyzeFrozen.current;
      const result = await analyzeEvent(event.id, {
        version: operation.version,
        requestId: operation.requestId,
        stage: "reflection",
        consent: true,
        ...aiAnalyzeFields(aiSettings),
      });
      analyzeFrozen.current = null;
      rememberRunUsage(result.runId, result.usage);
      setAiCandidates(result);
      toast({ title: "反思候选已返回", description: "确认保存之后，才会成为你的反思。" });
    } catch (analyzeError) {
      toast({ variant: "destructive", title: "反思候选没有确认完成", description: errorText(analyzeError) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-muted/10">
          <CardHeader className="py-4"><CardTitle className="text-sm text-muted-foreground">当时锁定的预测</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="font-medium text-base">{prediction.text}</div>
            <div className="text-primary font-mono bg-primary/10 inline-block px-2 rounded">把握 {prediction.probability}%</div>
            <div className="text-muted-foreground mt-2 border-t pt-2 border-border/50">标准：{prediction.criteria}</div>
          </CardContent>
        </Card>
        <Card className="bg-muted/10">
          <CardHeader className="py-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="text-muted-foreground">你确认的结果</span>
              <Badge variant="outline">{outcomeLabels[outcome.result]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>{outcome.notes || "没有观察说明"}</div>
            {outcome.intervention && <div><span className="font-medium text-muted-foreground">你的行动：</span>{outcome.intervention}</div>}
            {outcome.result === "unknown" && <p className="text-muted-foreground">这次未知不会进入有效验证。</p>}
          </CardContent>
        </Card>
      </div>

      {reflection ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif">已确认的反思</CardTitle>
            <CardDescription>原始记录保留。更正会追加在后面，并标明是你之后写下的。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ReflectionBlock title="原始反思" item={reflection} />
            {corrections.map((item, index) => (
              <ReflectionBlock key={`${item.createdAt}-${index}`} title={index === corrections.length - 1 ? "当前有效更正" : "更正"} item={item} source="你追加的更正" />
            ))}
            <div className="space-y-3 pt-4 border-t border-border">
              <Label>追加一条更正</Label>
              <Textarea value={lesson} onChange={(input) => setLesson(input.target.value)} placeholder="现在你确认的教训" />
              <Textarea value={wellFounded} onChange={(input) => setWellFounded(input.target.value)} placeholder="哪些判断有你当时的依据（选填）" />
              <Textarea value={overreach} onChange={(input) => setOverreach(input.target.value)} placeholder="哪里把推断说成了事实（选填）" />
              <Textarea value={missing} onChange={(input) => setMissing(input.target.value)} placeholder="当时还缺什么信息（选填）" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleCorrect} disabled={isSubmitting || !lesson.trim()}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              追加更正
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle className="text-xl font-serif">确认你的反思</CardTitle>
            <CardDescription>保存后就不能覆盖。请确认这是你自己的结论，而不是模型直接写下的结论。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {canAskAi && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="reflection-consent" checked={aiConsent} onCheckedChange={(checked) => setAiConsent(checked === true)} />
                  <Label htmlFor="reflection-consent" className="text-xs font-normal">同意请求反思候选</Label>
                </div>
                <Button variant="outline" onClick={handleAnalyze} disabled={isSubmitting}>
                  <Brain className="w-4 h-4 mr-2" /> 获取反思候选
                </Button>
              </div>
            )}
            {aiCandidates?.stage === "reflection" && (
              <div className="p-3 border border-border rounded-sm space-y-2 text-sm">
                <p className="text-muted-foreground">候选不会自动保存。</p>
                {aiCandidates.lesson || aiCandidates.wellFounded || aiCandidates.overreach || aiCandidates.missing ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    if (aiCandidates.lesson) setLesson(aiCandidates.lesson);
                    if (aiCandidates.wellFounded) setWellFounded(aiCandidates.wellFounded);
                    if (aiCandidates.overreach) setOverreach(aiCandidates.overreach);
                    if (aiCandidates.missing) setMissing(aiCandidates.missing);
                  }}>放入表单，仍由我确认</Button>
                ) : <p>这一阶段没有新的反思候选。</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label>哪些判断当时有依据</Label>
              <Textarea value={wellFounded} onChange={(input) => setWellFounded(input.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>哪里把推断说成了事实</Label>
              <Textarea value={overreach} onChange={(input) => setOverreach(input.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>当时还缺什么信息</Label>
              <Textarea value={missing} onChange={(input) => setMissing(input.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>你确认的一句话</Label>
              <Input value={lesson} onChange={(input) => setLesson(input.target.value)} placeholder="下次遇到类似沟通，我要先确认……" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSave} disabled={isSubmitting || !lesson.trim()}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              确认并保存反思
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function ReflectionBlock({ title, item, source }: { title: string; item: { lesson: string; wellFounded: string; overreach: string; missing: string; createdAt: string }; source?: string }) {
  return (
    <div className="p-3 bg-muted/30 border border-border rounded-sm space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
      </div>
      {source && <div className="text-xs text-muted-foreground">来源：{source}</div>}
      <div>{item.lesson}</div>
      {item.wellFounded && <div className="text-muted-foreground">有依据：{item.wellFounded}</div>}
      {item.overreach && <div className="text-muted-foreground">过度推断：{item.overreach}</div>}
      {item.missing && <div className="text-muted-foreground">当时所缺：{item.missing}</div>}
    </div>
  );
}
