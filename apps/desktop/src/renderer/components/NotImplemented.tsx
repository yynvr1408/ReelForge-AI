import { Construction } from 'lucide-react';

export function NotImplemented({
  feature,
  phase,
}: {
  feature: string;
  phase: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-neutral-400">
      <Construction size={32} className="text-neutral-500" />
      <p className="text-sm font-medium text-neutral-300">
        {feature} is not implemented yet
      </p>
      <p className="max-w-sm text-xs text-neutral-500">
        This is planned for {phase}. See
        docs/development/implementation-roadmap.md for the current build order.
      </p>
    </div>
  );
}
