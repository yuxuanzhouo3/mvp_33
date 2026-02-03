'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { DEFAULT_REGION, IS_DOMESTIC_VERSION } from '@/config';

export type Region = 'cn' | 'global';

export interface RegionInfo {
  region: Region;
  isChina: boolean;
  label: string;
  loading: boolean;
  error: string | null;
}

interface RegionContextType extends RegionInfo {
  refresh: () => Promise<void>;
}

const RegionContext = createContext<RegionContextType | undefined>(undefined);

interface RegionProviderProps {
  children: ReactNode;
}

/**
 * Region Context Provider
 * Uses environment variable to determine region (no IP detection)
 */
export const RegionProvider: React.FC<RegionProviderProps> = ({ children }) => {
  const value: RegionContextType = {
    region: DEFAULT_REGION,
    isChina: IS_DOMESTIC_VERSION,
    label: IS_DOMESTIC_VERSION ? 'China' : 'Global',
    loading: false,
    error: null,
    refresh: async () => {}, // Empty operation for API compatibility
  };

  return (
    <RegionContext.Provider value={value}>
      {children}
    </RegionContext.Provider>
  );
};

/**
 * Hook to use region information
 */
export const useRegion = (): RegionInfo => {
  const context = useContext(RegionContext);
  if (context === undefined) {
    throw new Error('useRegion must be used within a RegionProvider');
  }

  return {
    region: context.region,
    isChina: context.isChina,
    label: context.label,
    loading: context.loading,
    error: context.error,
  };
};




























































































































































