'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone, Tablet, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useDeviceListener } from '@/hooks/use-device-listener';
import { AppNavigation } from '@/components/layout/app-navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSettings } from '@/lib/settings-context';

interface Device {
  id: string;
  device_name: string;
  device_type: 'ios' | 'android' | 'web' | 'desktop';
  device_category?: 'desktop' | 'mobile' | 'tablet';
  client_type?: 'web' | 'android_app' | 'ios_app' | 'desktop_app';
  device_model?: string | null;
  device_brand?: string | null;
  last_active_at: string;
  ip_address?: string;
  location?: string;
  session_token?: string;
  is_current?: boolean;
  browser?: string;
  os?: string;
}

const getDeviceIcon = (device: Device) => {
  const category = device.device_category;
  const clientType = device.client_type;
  const type = device.device_type;

  if (category === 'tablet') return <Tablet className="h-5 w-5" />;
  if (
    category === 'mobile' ||
    clientType === 'android_app' ||
    clientType === 'ios_app' ||
    type === 'android' ||
    type === 'ios'
  ) {
    return <Smartphone className="h-5 w-5" />;
  }

  return <Monitor className="h-5 w-5" />;
};

const formatTime = (time: string, language: 'zh' | 'en') => {
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return language === 'zh' ? '刚刚' : 'Just now';
  if (minutes < 60) return language === 'zh' ? `${minutes}分钟前` : `${minutes}m ago`;
  if (hours < 24) return language === 'zh' ? `${hours}小时前` : `${hours}h ago`;
  return language === 'zh' ? `${days}天前` : `${days}d ago`;
};

const getDeviceCategoryLabel = (device: Device, language: 'zh' | 'en') => {
  const category = device.device_category;
  if (category === 'mobile') return language === 'zh' ? '手机' : 'Mobile';
  if (category === 'tablet') return language === 'zh' ? '平板' : 'Tablet';
  if (category === 'desktop') return language === 'zh' ? '电脑' : 'Desktop';
  if (device.device_type === 'android' || device.device_type === 'ios') return language === 'zh' ? '手机' : 'Mobile';
  return language === 'zh' ? '电脑' : 'Desktop';
};

const getClientTypeLabel = (clientType: string | undefined, language: 'zh' | 'en') => {
  if (clientType === 'android_app') return language === 'zh' ? 'Android 客户端' : 'Android App';
  if (clientType === 'ios_app') return language === 'zh' ? 'iOS 客户端' : 'iOS App';
  if (clientType === 'desktop_app') return language === 'zh' ? '桌面客户端' : 'Desktop App';
  return 'Web';
};

const formatDeviceTitle = (device: Device) => {
  const brand = device.device_brand?.trim();
  const model = device.device_model?.trim();
  if (brand && model) {
    return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`;
  }
  if (model) return model;
  if (device.browser && device.os) return `${device.browser} on ${device.os}`;
  return device.device_name || 'Unknown Device';
};

const formatLocationLabel = (location: string | undefined, language: 'zh' | 'en') => {
  const text = (location || '').trim();
  if (!text) return language === 'zh' ? '未知' : 'Unknown';
  const normalized = text.toLowerCase();
  if (normalized === 'unknown' || normalized === 'unknown, unknown') return language === 'zh' ? '未知' : 'Unknown';
  return text;
};

export default function DevicesPage() {
  const { language } = useSettings();
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentSessionToken, setCurrentSessionToken] = useState<string>('');
  const [kickingDeviceId, setKickingDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    void loadInitialData();
  }, []);

  useDeviceListener(currentSessionToken);

  const isCurrentDevice = (device: Device) => {
    if (device.is_current) return true;
    if (!currentSessionToken) return false;
    return device.session_token === currentSessionToken;
  };

  const currentDevice = useMemo(() => {
    return devices.find((device) => isCurrentDevice(device)) || null;
  }, [devices, currentSessionToken]);

  const otherDevices = useMemo(() => {
    return devices.filter((device) => !isCurrentDevice(device));
  }, [devices, currentSessionToken]);

  const loadInitialData = async () => {
    setLoading(true);
    await Promise.allSettled([loadDevices(), loadCurrentSession()]);
    setLoading(false);
  };

  const loadDevices = async () => {
    try {
      const response = await fetch('/api/devices');
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      } else {
        toast.error(tr('加载设备列表失败', 'Failed to load devices'));
      }
    } catch (error) {
      toast.error(tr('加载设备列表失败', 'Failed to load devices'));
    }
  };

  const loadCurrentSession = async () => {
    try {
      const response = await fetch('/api/devices/current');
      if (response.ok) {
        const data = await response.json();
        const token = data.sessionToken || data.sessionId || '';
        setCurrentSessionToken(token);
      }
    } catch (error) {
      console.error('Failed to load current session');
    }
  };

  const handleKickDevice = async (deviceId: string) => {
    setKickingDeviceId(deviceId);
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success(tr('设备已下线', 'Device signed out'));
        await loadDevices();
      } else {
        toast.error(tr('操作失败', 'Operation failed'));
      }
    } catch (error) {
      toast.error(tr('操作失败', 'Operation failed'));
    } finally {
      setKickingDeviceId(null);
    }
  };

  const renderDeviceCard = (device: Device, showKickAction: boolean) => (
    <Card key={device.id} className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
            {getDeviceIcon(device)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-medium text-gray-900">{formatDeviceTitle(device)}</h3>
              {isCurrentDevice(device) && (
                <Badge variant="secondary" className="border-green-200 bg-green-50 text-green-700">
                  {tr('当前设备', 'Current device')}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {[
                getClientTypeLabel(device.client_type, language as 'zh' | 'en'),
                getDeviceCategoryLabel(device, language as 'zh' | 'en'),
                tr('最后活跃 ', 'Last active ') + formatTime(device.last_active_at, language as 'zh' | 'en')
              ].join(' · ')}
            </p>
            <div className="mt-2 space-y-1 text-sm text-gray-500">
              <p>{tr('IP 地址', 'IP')}: {device.ip_address || tr('未知', 'Unknown')}</p>
              <p>{tr('位置', 'Location')}: {formatLocationLabel(device.location, language as 'zh' | 'en')}</p>
            </div>
          </div>
        </div>
        {showKickAction && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleKickDevice(device.id)}
            disabled={kickingDeviceId === device.id}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {tr('下线', 'Sign out')}
          </Button>
        )}
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">{tr('加载中...', 'Loading...')}</div>
        </div>
        {isMobile && <AppNavigation mobile />}
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0 flex-col mobile-app-shell mobile-overscroll-contain">
      <div className="flex-1 overflow-y-auto mobile-scroll-y mobile-overscroll-contain">
        <div className="space-y-6 px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{tr('设备管理', 'Device Management')}</h1>
            <p className="mt-1 text-sm text-gray-500">{tr('管理所有登录设备，可以远程下线其他设备', 'Manage all signed-in devices and remotely sign out other devices')}</p>
          </div>

          {devices.length === 0 ? (
            <Card className="p-12 text-center">
              <Monitor className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">{tr('暂无登录设备', 'No signed-in devices')}</p>
            </Card>
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{tr('当前设备', 'Current Device')}</h2>
                {currentDevice ? (
                  renderDeviceCard(currentDevice, false)
                ) : (
                  <Card className="p-5 text-sm text-gray-500">{tr('当前设备识别中，请刷新后重试', 'Detecting current device, please refresh and try again')}</Card>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{tr('其他设备', 'Other Devices')}</h2>
                {otherDevices.length === 0 ? (
                  <Card className="p-5 text-sm text-gray-500">{tr('暂无其他登录设备', 'No other signed-in devices')}</Card>
                ) : (
                  <div className="space-y-4">
                    {otherDevices.map((device) => renderDeviceCard(device, true))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
      {isMobile && <AppNavigation mobile />}
    </div>
  );
}
