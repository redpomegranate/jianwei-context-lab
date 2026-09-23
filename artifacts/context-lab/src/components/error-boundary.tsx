import { Component, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  resetKey?: any;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[50vh] w-full flex-col items-center justify-center gap-4 rounded-sm border border-destructive/20 bg-destructive/5 p-8 text-center text-destructive">
          <AlertCircle className="h-10 w-10 opacity-80" />
          <div className="space-y-1">
            <h3 className="font-medium text-lg font-serif">渲染出错</h3>
            <p className="text-sm opacity-80 max-w-md mx-auto">
              {this.state.error?.message || "应用程序遇到了意外错误。"}
            </p>
          </div>
          <Button
            variant="outline"
            className="mt-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
