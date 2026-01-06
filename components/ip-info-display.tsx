'use client';

import { useRegion } from '@/lib/region-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

/**
 * IP Information Display Component
 * Shows current IP detection result and region information
 */
export function IPInfoDisplay() {
  const { region, isChina, label, loading, error, regionInfo } = useRegion();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>IP 识别</CardTitle>
          <CardDescription>正在检测您的位置...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-sm text-muted-foreground">检测中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>IP 识别</CardTitle>
          <CardDescription>检测失败</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IP 识别</CardTitle>
        <CardDescription>当前系统区域信息</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">区域:</span>
          <Badge variant={isChina ? 'default' : 'secondary'}>
            {label}
          </Badge>
        </div>
        
        {regionInfo && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">IP 地址:</span>
              <span className="text-sm text-muted-foreground font-mono">
                {regionInfo.ip !== 'unknown' ? regionInfo.ip : '未知'}
              </span>
            </div>
            
            {regionInfo.country && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">国家代码:</span>
                <span className="text-sm text-muted-foreground">
                  {regionInfo.country}
                </span>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">推荐系统:</span>
              <Badge variant="outline">
                {region === 'cn' ? '国内系统' : '国际系统'}
              </Badge>
            </div>
            
            {regionInfo.detectedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">检测时间:</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(regionInfo.detectedAt).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}




























































































































































