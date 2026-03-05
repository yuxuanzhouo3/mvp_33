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

const formatTime = (time: string) => {
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
};

const getDeviceCategoryLabel = (device: Device) => {
  const category = device.device_category;
  if (category === 'mobile') return '手机';
  if (category === 'tablet') return '平板';
  if (category === 'desktop') return '电脑';
  if (device.device_type === 'android' || device.device_type === 'ios') return '手机';
  return '电脑';
};

const getClientTypeLabel = (clientType?: string) => {
  if (clientType === 'android_app') return 'Android 客户端';
  if (clientType === 'ios_app') return 'iOS 客户端';
  if (clientType === 'desktop_app') return '桌面客户端';
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

export default function DevicesPage() {
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
        toast.error('加载设备列表失败');
      }
    } catch (error) {
      toast.error('加载设备列表失败');
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
        toast.success('设备已下线');
        await loadDevices();
      } else {
        toast.error('操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
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
                  当前设备
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {[getClientTypeLabel(device.client_type), getDeviceCategoryLabel(device), `最后活跃 ${formatTime(device.last_active_at)}`].join(' · ')}
            </p>
            <div className="mt-2 space-y-1 text-sm text-gray-500">
              <p>IP 地址: {device.ip_address || 'Unknown'}</p>
              <p>位置: {device.location || 'Unknown'}</p>
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
            下线
          </Button>
        )}
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
        {isMobile && <AppNavigation mobile />}
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">设备管理</h1>
            <p className="mt-1 text-sm text-gray-500">管理所有登录设备，可以远程下线其他设备</p>
          </div>

          {devices.length === 0 ? (
            <Card className="p-12 text-center">
              <Monitor className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">暂无登录设备</p>
            </Card>
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">当前设备</h2>
                {currentDevice ? (
                  renderDeviceCard(currentDevice, false)
                ) : (
                  <Card className="p-5 text-sm text-gray-500">当前设备识别中，请刷新后重试</Card>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">其他设备</h2>
                {otherDevices.length === 0 ? (
                  <Card className="p-5 text-sm text-gray-500">暂无其他登录设备</Card>
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
