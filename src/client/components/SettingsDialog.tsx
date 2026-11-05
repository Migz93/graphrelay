import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { primaryButtonClass, secondaryButtonClass } from "./FormControls";

export function SettingsDialog({ title, tabs, selected, select, close, children }: {
  title: string; tabs: string[]; selected: string; select: (tab: string) => void; close: () => void; children: ReactNode;
}) {
  const id = useId();
  const ref = useDialogA11y<HTMLDivElement>(true, close);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={close}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-outline-variant/20 bg-background-container p-4 shadow-xl sm:p-6" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
        <h2 id={id} className="font-headline text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Close Settings" data-overlay-initial-focus onClick={close} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-background-container-high hover:text-on-surface"><X size={18} /></button>
      </div>
      {!!tabs.length && <div className="mb-5 flex shrink-0 flex-wrap gap-2 border-b border-outline-variant/30 pb-3" aria-label="Settings Sections">
        {tabs.map(tab => <button key={tab} type="button" aria-pressed={selected === tab} className={selected === tab ? primaryButtonClass : secondaryButtonClass} onClick={() => select(tab)}>{tab}</button>)}
      </div>}
      {children}
    </div>
  </div>;
}
