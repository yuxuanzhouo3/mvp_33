'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone, Tablet, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useDeviceListener } from '@/hooks/use-device-listener';

interface Device {
  id: string;
  device_name: string;
  device_type: 'ios' | 'android' | 'web' | 'desktop';
  last_active_at: string;
  ip_address: string;
  location: string;
  browser?: string;
  os?: string;
}

const getDeviceIcon = (type: string) => {
  switch (type) {
    case 'desktop': return <Monitor className="w-5 h-5" />;
    case 'mobile': return <Smartphone className="w-5 h-5" />;
    case 'tablet': return <Tablet className="w-5 h-5" />;
    default: return <Monitor className="w-5 h-5" />;
  }
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

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
    loadCurrentSession();
  }, []);

  useDeviceListener(currentSessionId);

  const loadDevices = async () => {
    try {
      const response = await fetch('/api/devices');
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      toast.error('加载设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentSession = async () => {
    try {
      const response = await fetch('/api/devices/current');
      if (response.ok) {
        const data = await response.json();
        setCurrentSessionId(data.sessionId);
      }
    } catch (error) {
      console.error('Failed to load current session');
    }
  };

  const handleKickDevice = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('设备已下线');
        setDevices(devices.filter(d => d.id !== deviceId));
      } else {
        toast.error('操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">设备管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          管理所有登录设备，可以远程下线其他设备
        </p>
      </div>

      {devices.length === 0 ? (
        <Card className="p-12 text-center">
          <Monitor className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">暂无登录设备</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => (
            <Card key={device.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                    {getDeviceIcon(device.device_type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-gray-900">{device.device_name}</h3>
                      {device.id === currentSessionId && (
                        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                          当前设备
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      <p>最后活跃: {formatTime(device.last_active_at)}</p>
                      <p>IP 地址: {device.ip_address}</p>
                      <p>位置: {device.location}</p>
                    </div>
                  </div>
                </div>
                {device.id !== currentSessionId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleKickDevice(device.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    下线
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
