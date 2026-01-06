'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { detectIP, IPInfo } from './ip-service';

export type Region = 'cn' | 'global';

export interface RegionInfo {
  region: Region;
  isChina: boolean;
  label: string;
  loading: boolean;
  error: string | null;
  regionInfo?: IPInfo | null;
}

interface RegionContextType extends RegionInfo {
  refresh: () => Promise<void>;
}

const RegionContext = createContext<RegionContextType | undefined>(undefined);

interface RegionProviderProps {
  children: ReactNode;
}

/**
 * Region detection Context Provider
 * Globally unified IP detection management, avoid multiple components calling repeatedly
 */
// Global flag to ensure only execute once even with React.StrictMode
let hasDetected = false;
let detectionPromise: Promise<void> | null = null;

export const RegionProvider: React.FC<RegionProviderProps> = ({ children }) => {
  const [regionInfo, setRegionInfo] = useState<IPInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const detectRegion = async () => {
    // If already detected, directly return
    if (hasDetected && detectionPromise) {
      await detectionPromise;
      return;
    }

    // If detecting, wait for completion
    if (isDetecting && detectionPromise) {
      await detectionPromise;
      return;
    }

    // Create detection Promise
    detectionPromise = (async () => {
      try {
        setIsDetecting(true);
        setLoading(true);
        setError(null);

        // Call API to detect
        const info = await detectIP();

        setRegionInfo(info);
        hasDetected = true;
        
        // Cache IP info to localStorage for regionConfig to use
        try {
          const cacheData = {
            ...info,
            cachedAt: new Date().toISOString()
          };
          localStorage.setItem('ip_info', JSON.stringify(cacheData));
        } catch (e) {
          // Silently handle errors
        }
      } catch (err) {
        setError('Region detection failed, using Global by default');
        const defaultInfo: IPInfo = {
          ip: 'unknown',
          country: null,
          isChina: false,
          recommendedRegion: 'global',
          detectedAt: new Date().toISOString()
        };
        setRegionInfo(defaultInfo);
        hasDetected = true; // Even if failed, mark as detected to avoid repetition
      } finally {
        setLoading(false);
        setIsDetecting(false);
      }
    })();

    await detectionPromise;
  };

  useEffect(() => {
    // Only detect once when component mounts (even React.StrictMode will skip through hasDetected flag)
    // Don't await - let it run in background to avoid blocking page load
    // Set a default region immediately so page can load
    if (!hasDetected) {
      // Set default region first
      const defaultInfo: IPInfo = {
        ip: 'unknown',
        country: null,
        isChina: false,
        recommendedRegion: 'global',
        detectedAt: new Date().toISOString()
      };
      setRegionInfo(defaultInfo);
      setLoading(false);
      
      // Then detect in background
      detectRegion().catch(err => {
        // Silently handle errors to prevent blocking
        console.error('Region detection error:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array, only execute once

  // Calculate current region
  const currentRegion: Region = regionInfo?.recommendedRegion || 'global';
  const isChina = regionInfo?.isChina ?? (currentRegion === 'cn');

  const value: RegionContextType = {
    region: currentRegion,
    isChina,
    label: isChina ? 'China' : 'Global',
    loading,
    error,
    regionInfo,
    refresh: detectRegion, // Provide manual refresh method
  };

  return (
    <RegionContext.Provider value={value}>
      {children}
    </RegionContext.Provider>
  );
};

/**
 * Hook to use region information
 * Replaces original useRegion, get from Context
 */
export const useRegion = (): RegionInfo => {
  const context = useContext(RegionContext);
  if (context === undefined) {
    throw new Error('useRegion must be used within a RegionProvider');
  }
  
  // Only return RegionInfo part, don't expose refresh method
  return {
    region: context.region,
    isChina: context.isChina,
    label: context.label,
    loading: context.loading,
    error: context.error,
    regionInfo: context.regionInfo,
  };
};




























































































































































