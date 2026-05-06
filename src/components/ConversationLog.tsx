import { Bot, CheckCircle2, GitBranch, Wrench } from "lucide-react";
import type { NodeRunTrace, TurnTrace } from "../types";
import { sideName } from "../lib/chess";

type Props = {
  traces: TurnTrace[];
};

const iconByType = {
  llm: Bot,
  logic: GitBranch,
  parser: Wrench,
  legal: CheckCircle2
} as const;

export function ConversationLog({ traces }: Props) {
  return (
    <section className="panel conversation-panel">
      <div className="panel-header">
        <div>
          <h2>Conversation</h2>
          <span>{traces.length} LLM turns</span>
        </div>
      </div>
      <div className="trace-scroll">
        {!traces.length ? (
          <div className="empty-state">No LLM calls yet.</div>
        ) : (
          traces
            .slice()
            .reverse()
            .map((trace) => <TurnCard key={trace.id} trace={trace} />)
        )}
      </div>
    </section>
  );
}

function TurnCard({ trace }: { trace: TurnTrace }) {
  const tokenTotal = trace.runs.reduce((sum, run) => sum + (run.tokenUsage?.totalTokens || 0), 0);
  return (
    <details className={`turn-card turn-card-${trace.side}`}>
      <summary className="turn-card-head">
        <strong>
          <span className={`side-pill ${trace.side}`}>{sideName(trace.side)}</span>
          {trace.san} <span>{trace.move}</span>
        </strong>
        <span className="turn-meta">
          {trace.systemLabel}
          {tokenTotal ? ` · ${tokenTotal} tok` : ""}
          {trace.fallbackUsed ? " · fallback" : ""}
        </span>
      </summary>
      <div className="fen-line">{trace.fenBefore}</div>
      <div className="node-run-list">
        {trace.runs.map((run) => (
          <NodeRun key={`${trace.id}-${run.nodeId}`} run={run} />
        ))}
      </div>
    </details>
  );
}

function NodeRun({ run }: { run: NodeRunTrace }) {
  const Icon = iconByType[run.nodeType];
  return (
    <details className={`node-run node-run-${run.nodeType}`}>
      <summary>
        <span>
          <Icon size={14} />
          {run.nodeLabel || run.nodeId}
        </span>
        <span>
          {run.durationMs} ms
          {run.tokenUsage?.totalTokens ? ` · ${run.tokenUsage.totalTokens} tok` : ""}
        </span>
      </summary>
      {run.tokenUsage && (
        <div className="token-line">
          input {run.tokenUsage.inputTokens ?? "-"} · output {run.tokenUsage.outputTokens ?? "-"} · total{" "}
          {run.tokenUsage.totalTokens ?? "-"}
        </div>
      )}
      {run.messages?.length ? (
        <div className="message-stack">
          {run.messages.map((message, index) => (
            <div className="message-block" key={`${message.role}-${index}`}>
              <label>{message.role}</label>
              <pre>{message.content}</pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="message-block">
          <label>output</label>
          <pre>{JSON.stringify(run.output, null, 2)}</pre>
        </div>
      )}
      {run.error && <div className="inline-error">{run.error}</div>}
    </details>
  );
}
