'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Html5Qrcode } from 'html5-qrcode'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { Loader2, Camera, AlertCircle, UserPlus, Image as ImageIcon } from 'lucide-react'

interface ScanQRDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddContact: (userId: string) => void
}

export function ScanQRDialog({ open, onOpenChange, onAddContact }: ScanQRDialogProps) {
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedUser, setScannedUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const qrReaderRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseQRCode = (data: string): string | null => {
    const match = data.match(/orbitchat:\/\/add-friend\?userId=(.+)/)
    return match ? match[1] : null
  }

  const startScanning = async () => {
    console.log('[扫码] startScanning 被调用')

    try {
      console.log('[扫码] 开始扫描流程')
      setError(null)
      setScanning(true)

      // 等待 DOM 元素完全就绪
      console.log('[扫码] 等待 100ms...')
      await new Promise(resolve => setTimeout(resolve, 100))

      // 再次检查元素是否存在
      const element = document.getElementById('qr-reader')
      console.log('[扫码] DOM 元素检查:', element)
      if (!element) {
        console.error('[扫码] DOM 元素未找到')
        throw new Error('QR reader element not found')
      }

      console.log('[扫码] 创建 Html5Qrcode 实例')
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      console.log('[扫码] Html5Qrcode 实例创建成功')

      console.log('[扫码] 调用 scanner.start...')
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const userId = parseQRCode(decodedText)

          if (!userId) {
            setError(t('invalidQRCode'))
            return
          }

          await stopScanning()
          setLoading(true)

          try {
            const response = await fetch(`/api/users/search?q=${encodeURIComponent(userId)}`)
            const data = await response.json()

            if (!response.ok || !data.users || data.users.length === 0) {
              setError(t('userNotFound'))
              setLoading(false)
              return
            }

            setScannedUser(data.users[0])
          } catch (err) {
            setError(t('networkError'))
          } finally {
            setLoading(false)
          }
        },
        () => {}
      )
    } catch (err: any) {
      setScanning(false)
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
        setError(t('cameraPermissionDenied'))
      } else {
        setError(t('cameraError'))
      }
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) {
        console.error('停止扫描失败:', err)
      }
    }
    setScanning(false)
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[扫码] 开始处理选择的图片')
    const file = e.target.files?.[0]
    if (!file) {
      console.log('[扫码] 未选择文件')
      return
    }

    console.log('[扫码] 选择的文件:', file.name, file.type, file.size)

    console.log('[扫码] 停止摄像头扫描...')
    await stopScanning()
    console.log('[扫码] 摄像头扫描已停止')

    setError(null)

    // 等待 DOM 元素完全就绪
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      console.log('[扫码] 创建 Html5Qrcode 实例用于图片扫描')
      const html5QrCode = new Html5Qrcode('qr-reader')
      console.log('[扫码] Html5Qrcode 实例创建成功')

      console.log('[扫码] 准备调用 scanFile 方法...')
      console.log('[扫码] 文件详情:', { name: file.name, type: file.type, size: file.size })

      const decodedText = await html5QrCode.scanFile(file, false)

      // 扫描完成后设置 loading 状态
      setLoading(true)

      console.log('[扫码] scanFile 调用完成')
      console.log('[扫码] 扫描成功，解码结果:', decodedText)

      const userId = parseQRCode(decodedText)
      console.log('[扫码] 解析用户ID:', userId)

      if (!userId) {
        console.error('[扫码] 无效的二维码格式')
        setError(t('invalidQRCode'))
        setLoading(false)
        return
      }

      console.log('[扫码] 开始查询用户信息，userId:', userId)
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}`)
      console.log('[扫码] API 响应状态:', response.status, response.statusText)

      const data = await response.json()
      console.log('[扫码] API 响应数据:', data)

      if (!response.ok || !data.user) {
        console.error('[扫码] 用户未找到')
        setError(t('userNotFound'))
        setLoading(false)
        return
      }

      console.log('[扫码] 找到用户:', data.user)
      setScannedUser(data.user)
      console.log('[扫码] 用户信息已设置')
    } catch (err: any) {
      console.error('[扫码] 图片扫描失败')
      console.error('[扫码] 错误类型:', err?.constructor?.name)
      console.error('[扫码] 错误消息:', err?.message)
      console.error('[扫码] 错误堆栈:', err?.stack)
      console.error('[扫码] 完整错误对象:', err)
      setError(t('invalidQRCode'))
    } finally {
      console.log('[扫码] 进入 finally 块')
      setLoading(false)
      console.log('[扫码] loading 已设置为 false')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
        console.log('[扫码] 文件输入已清空')
      }
      console.log('[扫码] handleImageSelect 执行完成')
    }
  }

  const handleClose = async () => {
    await stopScanning()
    setError(null)
    setScannedUser(null)
    setLoading(false)
    onOpenChange(false)
  }

  const handleAddContact = () => {
    if (scannedUser) {
      console.log('[扫码] 准备发送好友请求:', scannedUser.id)
      onAddContact(scannedUser.id)
      handleClose()
    }
  }

  useEffect(() => {
    if (open && !scanning && !scannedUser && !error) {
      startScanning()
    }

    return () => {
      if (scannerRef.current) {
        stopScanning()
      }
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scanQRCode')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {scannedUser ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <Avatar className="h-20 w-20">
                <AvatarImage src={scannedUser.avatar_url || undefined} />
                <AvatarFallback name={scannedUser.full_name}>
                  {scannedUser.full_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <div className="font-semibold text-lg">{scannedUser.full_name}</div>
                <div className="text-sm text-muted-foreground">@{scannedUser.username}</div>
                {scannedUser.title && (
                  <div className="text-sm text-muted-foreground mt-1">{scannedUser.title}</div>
                )}
              </div>
              <Button onClick={handleAddContact} className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                {t('addContact')}
              </Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-center text-destructive">{error}</p>
              <Button onClick={startScanning} variant="outline">
                {t('retry')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              <div id="qr-reader" ref={qrReaderRef} className="w-full min-h-[250px] flex items-center justify-center bg-muted/30 rounded-lg">
                {!scanning && (
                  <div className="text-sm text-muted-foreground">
                    请选择扫描方式
                  </div>
                )}
              </div>
              {scanning && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Camera className="h-4 w-4" />
                  <span>{t('scanningQRCode')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={startScanning} variant="outline" className="flex-1" disabled={scanning}>
                  <Camera className="h-4 w-4 mr-2" />
                  扫一扫
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="flex-1">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  从相册选择
                </Button>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  )
}
