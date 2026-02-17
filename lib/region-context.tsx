'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { DEFAULT_REGION, IS_CN_DEPLOYMENT } from '@/config';

export type Region = 'cn' | 'global';

export interface RegionInfo {
  region: Region;
  isChina: boolean;
  label: string;
}

const RegionContext = createContext<RegionInfo | undefined>(undefined);

interface RegionProviderProps {
  children: ReactNode;
}

/**
 * Region Context Provider
 * 直接使用构建时确定的配置，无需动态检测
 */
export const RegionProvider: React.FC<RegionProviderProps> = ({ children }) => {
  const value: RegionInfo = {
    region: DEFAULT_REGION,
    isChina: IS_CN_DEPLOYMENT,
    label: IS_CN_DEPLOYMENT ? 'China' : 'Global',
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
  return context;
};




























































































































































