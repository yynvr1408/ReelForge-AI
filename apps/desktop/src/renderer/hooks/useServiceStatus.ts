import { useEffect, useState } from 'react';
import type { ServiceStatus } from '../../shared/ipc-contract';

export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>({ state: 'starting' });

  useEffect(() => {
    let cancelled = false;
    window.reelforge.getServiceStatus().then((initial) => {
      if (!cancelled) setStatus(initial);
    });
    const unsubscribe = window.reelforge.onServiceStatus((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return status;
}
