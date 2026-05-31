'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadFromDrive } from '../lib/drive';
import type { PcDevice } from '../types';

const SELECTED_PC_KEY = 'viewer_target_pc_id';

type PcDevicesJson = {
  pcs?: PcDevice[];
};

function normalizePcDevices(data: unknown): PcDevice[] {
  const pcs = (data as PcDevicesJson | null)?.pcs;
  if (!Array.isArray(pcs)) return [];

  const byName = new Map<string, PcDevice>();
  for (const pc of pcs) {
    if (!pc.pcId || !pc.pcName) continue;
    const current = byName.get(pc.pcName);
    const currentTime = current?.updatedAt ? new Date(current.updatedAt).getTime() : 0;
    const nextTime = pc.updatedAt ? new Date(pc.updatedAt).getTime() : 0;
    if (!current || nextTime >= currentTime) {
      byName.set(pc.pcName, pc);
    }
  }

  return Array.from(byName.values());
}

function getStoredPcId() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SELECTED_PC_KEY) ?? '';
}

function storeSelectedPcId(pcId: string) {
  if (typeof window === 'undefined') return;
  if (pcId) {
    localStorage.setItem(SELECTED_PC_KEY, pcId);
  } else {
    localStorage.removeItem(SELECTED_PC_KEY);
  }
}

function choosePcId(pcs: PcDevice[], current: string) {
  const stored = current || getStoredPcId();
  const next = pcs.some((pc) => pc.pcId === stored) ? stored : (pcs[0]?.pcId ?? '');
  storeSelectedPcId(next);
  return next;
}

export function usePcDevices(accessToken: string | null) {
  const [pcDevices, setPcDevices] = useState<PcDevice[]>([]);
  const [selectedPcId, setSelectedPcIdState] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSelectedPcIdState(getStoredPcId());
  }, []);

  const refreshPcDevices = useCallback(async () => {
    if (!accessToken) return selectedPcId || getStoredPcId();
    try {
      const data = await downloadFromDrive(accessToken, 'pc_devices.json');
      const pcs = normalizePcDevices(data);
      setPcDevices(pcs);
      let nextPcId = selectedPcId;
      setSelectedPcIdState((current) => {
        nextPcId = choosePcId(pcs, current);
        return nextPcId;
      });
      return nextPcId || getStoredPcId();
    } catch {
      return selectedPcId || getStoredPcId();
    }
  }, [accessToken, selectedPcId]);

  useEffect(() => {
    if (!accessToken) {
      setPcDevices([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const data = await downloadFromDrive(accessToken, 'pc_devices.json').catch(() => null);
      if (cancelled) return;
      const pcs = normalizePcDevices(data);
      setPcDevices(pcs);
      setSelectedPcIdState((current) => {
        return choosePcId(pcs, current);
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const setSelectedPcId = (pcId: string) => {
    setSelectedPcIdState(pcId);
    storeSelectedPcId(pcId);
  };

  return { pcDevices, selectedPcId, setSelectedPcId, refreshPcDevices };
}
