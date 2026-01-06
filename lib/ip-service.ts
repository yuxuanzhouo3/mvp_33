'use client';

export interface IPInfo {
  ip: string;
  country: string | null;
  city?: string | null;
  isChina: boolean;
  recommendedRegion: 'cn' | 'global';
  detectedAt: string;
}

export interface IPDetectionResponse {
  success: boolean;
  data: IPInfo;
}

/**
 * Use ipip.net to detect IP (very accurate for China IPs, free and no key required)
 * ipip.net is a professional IP geolocation service in China, very accurate for city-level location of China IPs
 */
const detectIPFromIPIP = async (): Promise<IPInfo | null> => {
  try {
    // ipip.net free API, very accurate for China IP location
    const response = await fetch('https://freeapi.ipip.net/', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json();

    // ipip.net return format: ["Country", "Province", "City", "ISP"]
    // Only use country information, don't save city and province
    if (Array.isArray(data) && data.length >= 1) {
      const country = data[0] || null;
      
      // Ensure country judgment is correct: China, CN, China are all considered CN
      const isChina = country === '中国' || country === 'CN' || country === 'China' || country === 'china';

      // Get IP address (requires separate request)
      let ip = 'unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json', { 
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        const ipData = await ipResponse.json();
        ip = ipData.ip || 'unknown';
      } catch (e) {
        // Ignore error
      }
      
      // Verify: at least country should be correct
      if (!country) {
        return null;
      }

      return {
        ip,
        country: isChina ? 'CN' : null,
        city: null, // No longer save city
        isChina,
        recommendedRegion: isChina ? 'cn' : 'global',
        detectedAt: new Date().toISOString()
      };
    } else {
      return null;
    }
  } catch (error: any) {
    return null;
  }
};

/**
 * Use ip-api.com to detect IP (free and supports city-level location, relatively accurate for China IPs)
 * Note: ip-api.com has limits on HTTP requests, but free version supports city-level location
 */
const detectIPFromIPAPI = async (): Promise<IPInfo | null> => {
  try {
    // ip-api.com free version, supports city-level location
    // Note: free version has limits on HTTP requests (45 per minute), but supports city-level location
    // Use HTTPS to avoid mixed content issues
    const url = new URL('https://ip-api.com/json/');
    url.searchParams.set('fields', 'status,message,country,countryCode,region,regionName,city,lat,lon,query');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json();

    if (data.status === 'success' && data.countryCode) {
      const ip = data.query || 'unknown';
      const country = data.countryCode;
      const isChina = country === 'CN';

      return {
        ip,
        country,
        city: null, // No longer save city
        isChina,
        recommendedRegion: isChina ? 'cn' : 'global',
        detectedAt: new Date().toISOString()
      };
    }
    
    return null;
  } catch (error: any) {
    return null;
  }
};

/**
 * Get client real IP directly through third-party API (recommended)
 * Does not depend on backend, directly get VPN/real IP from browser
 * Priority to use ipip.net (very accurate for China IP location), then use ip-api.com
 */
const detectIPFromThirdParty = async (): Promise<IPInfo> => {
  // Priority to use ipapi.co (most reliable, free and provides complete information)
  try {
    const response = await fetch('https://ipapi.co/json/', { 
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    const data = await response.json();

    let country = null;
    let ip = null;
    
    // ipapi.co format
    if (data.country_code || data.country) {
      country = data.country_code || data.country;
      ip = data.ip;
      // No longer save province, city and coordinates
    }
    
    // Only consider CN as China
    const isChina = country === 'CN';
    
    if (country) {
      return {
        ip: ip || 'unknown',
        country: country,
        city: null, // No longer save city
        isChina: isChina,
        recommendedRegion: isChina ? 'cn' : 'global',
        detectedAt: new Date().toISOString()
      };
    }
  } catch (error: any) {
    // Continue to fallback
  }

  // Fallback: use ipip.net (very accurate for China IP location, free and no key required)
  const ipipResult = await detectIPFromIPIP();
  if (ipipResult) {
    return ipipResult;
  }

  // Fallback: use ip-api.com (free and supports city-level location, relatively accurate for China IPs)
  const ipApiResult = await detectIPFromIPAPI();
  if (ipApiResult) {
    return ipApiResult;
  }

  // Final fallback API
  const apis = [
    { url: 'https://api.country.is/', name: 'country.is' } // Final fallback: only provides country code
  ];
  
  for (const api of apis) {
    try {
      const response = await fetch(api.url, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      const data = await response.json();

      let country = null;
      let ip = null;
      
      // country.is format (only provides country code)
      if (data.country) {
        country = data.country;
        ip = data.ip;
      }
      
      // Only consider CN as China
      const isChina = country === 'CN';
      
      if (country) {
        return {
          ip: ip || 'unknown',
          country: country,
          city: null, // No longer save city
          isChina: isChina,
          recommendedRegion: isChina ? 'cn' : 'global',
          detectedAt: new Date().toISOString()
        };
      }
    } catch (error: any) {
      continue; // Try next API
    }
  }
  
  // All APIs failed
  throw new Error('All third-party APIs failed');
};

// Global flag to prevent duplicate saves
let isSaving = false;
let lastSavedIP: string | null = null;
let lastSavedTime: number = 0;
const SAVE_COOLDOWN = 60000; // Don't save again within 1 minute

/**
 * Call backend API to save IP record to database
 * Add frontend deduplication logic to avoid saving repeatedly in short time
 */
const saveIPToBackend = async (ipInfo: IPInfo): Promise<void> => {
  // Prevent concurrent calls
  if (isSaving) {
    return;
  }

  // Check if within cooldown period and same IP
  const now = Date.now();
  if (lastSavedIP === ipInfo.ip && (now - lastSavedTime) < SAVE_COOLDOWN) {
    return;
  }

  try {
    isSaving = true;
    // Select correct API address based on IP information
    const force = ipInfo.isChina ? 'cn' : 'global';
    const apiBaseUrl = force === 'cn' 
      ? (process.env.NEXT_PUBLIC_API_URL_CN || 'http://localhost:8000')
      : (process.env.NEXT_PUBLIC_API_URL_GLOBAL || 'http://localhost:8001');

    // Skip if using localhost and in development (backend service may not be running)
    if (apiBaseUrl.includes('localhost') && process.env.NODE_ENV === 'development') {
      // Silently skip in development if backend is not available
      lastSavedIP = ipInfo.ip;
      lastSavedTime = now;
      return;
    }

    // Call backend API to save, pass force parameter and real IP info to let backend save to correct database
    // Backend will judge based on force parameter whether to save to MySQL (cn) or Supabase (global)
    // Only pass IP and country code, don't pass city, province and coordinates
    const url = new URL(`${apiBaseUrl}/api/v1/utils/detect-ip`);
    if (ipInfo.ip !== 'unknown') {
      url.searchParams.set('ip', ipInfo.ip);
    }
    if (ipInfo.country) {
      url.searchParams.set('country', ipInfo.country);
    }
    url.searchParams.set('force', force);

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // Reduced timeout
    });

    if (!response.ok) {
      // Non-2xx response, silently fail
      return;
    }

    // Update save flag
    lastSavedIP = ipInfo.ip;
    lastSavedTime = now;
  } catch (error: any) {
    // Save failure doesn't affect frontend display
    // Only log in development if it's not a connection refused error
    if (process.env.NODE_ENV === 'development' && 
        !error?.message?.includes('ERR_CONNECTION_REFUSED') &&
        !error?.message?.includes('Failed to fetch')) {
      // Only log unexpected errors, not connection refused
    }
    // Silently fail for connection errors
  } finally {
    isSaving = false;
  }
};

/**
 * Detect current IP
 * Priority to use third-party API (directly get real IP), then call backend to save record
 */
export const detectIP = async (force?: 'cn' | 'global'): Promise<IPInfo> => {
  // If force specified, directly return
  if (force === 'cn') {
    return {
      ip: 'forced',
      country: 'CN',
      isChina: true,
      recommendedRegion: 'cn',
      detectedAt: new Date().toISOString()
    };
  }
  if (force === 'global') {
    return {
      ip: 'forced',
      country: null,
      isChina: false,
      recommendedRegion: 'global',
      detectedAt: new Date().toISOString()
    };
  }

  try {
    // Priority to use third-party API for direct detection (can get VPN IP)
    const result = await detectIPFromThirdParty();
    
    // Verify result: at least country should be correct

    // If detected as China but no country code, supplement country code
    if (result.isChina && !result.country) {
      result.country = 'CN';
    }
    
    // If country code is CN, ensure isChina is true
    if (result.country === 'CN' && !result.isChina) {
      result.isChina = true;
      result.recommendedRegion = 'cn';
    }

    // Asynchronously save to backend database (don't block frontend display)
    saveIPToBackend(result).catch(err => {
      // Silently handle errors
    });
    
    return result;
  } catch (error: any) {
    // Don't fallback to backend API (backend cannot get VPN IP)
    // If third-party API fails, default to Global (may be VPN environment)
    return {
      ip: 'unknown',
      country: null,
      isChina: false,
      recommendedRegion: 'global',
      detectedAt: new Date().toISOString()
    };
  }
};

/**
 * Get cached IP information from localStorage
 * Note: To support VPN switching, no longer read cache, always re-detect
 */
export const getCachedIPInfo = (): IPInfo | null => {
  // No longer read cache, always re-detect
  // This way VPN switching can immediately reflect new IP
  return null;
};

/**
 * Cache IP information to localStorage
 */
export const cacheIPInfo = (info: IPInfo): void => {
  try {
    const cachedInfo = {
      ...info,
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem('ip_info', JSON.stringify(cachedInfo));
  } catch (error) {
    // Silently handle errors
  }
};



