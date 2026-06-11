"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error?: Error };

/** Client error boundary with a retry action. Wrap interactive widgets. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorState
          description={this.state.error?.message ?? "เกิดข้อผิดพลาดในการแสดงผล"}
          action={
            <Button variant="outline" onClick={this.reset}>
              ลองใหม่อีกครั้ง
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
