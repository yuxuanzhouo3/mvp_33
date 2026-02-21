/**
 * Report User Dialog
 * 举报用户对话框
 */

'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { toast } from '@/hooks/use-toast'
import { ReportType } from '@/lib/interfaces/types'

interface ReportUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  onReported: () => void
}

const reportTypes: { value: ReportType; labelEn: string; labelZh: string }[] = [
  { value: 'spam', labelEn: 'Spam', labelZh: '垃圾信息' },
  { value: 'harassment', labelEn: 'Harassment', labelZh: '骚扰' },
  { value: 'inappropriate', labelEn: 'Inappropriate Content', labelZh: '不当内容' },
  { value: 'other', labelEn: 'Other', labelZh: '其他' },
]

export function ReportUserDialog({
  open,
  onOpenChange,
  userId,
  userName,
  onReported,
}: ReportUserDialogProps) {
  const [reportType, setReportType] = useState<ReportType>('spam')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { language } = useSettings()

  const handleReport = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reported_user_id: userId,
          type: reportType,
          description: description.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || (language === 'zh' ? '举报失败' : 'Failed to report user'))
      }

      // 显示成功提示
      toast({
        title: language === 'zh' ? '举报成功' : 'Report Submitted',
        description: language === 'zh'
          ? `您对 ${userName} 的举报已提交，我们会尽快处理`
          : `Your report against ${userName} has been submitted. We will review it shortly.`,
      })

      // 重置状态
      setDescription('')
      setReportType('spam')
      onReported()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Report user error:', error)
      // 显示错误提示
      toast({
        variant: 'destructive',
        title: language === 'zh' ? '举报失败' : 'Report Failed',
        description: error.message || (language === 'zh' ? '操作失败，请重试' : 'Operation failed, please try again'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setDescription('')
      setReportType('spam')
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language === 'zh' ? '举报用户' : 'Report User'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {language === 'zh'
                  ? `您正在举报 ${userName}，请选择举报类型：`
                  : `You are reporting ${userName}. Please select a reason:`}
              </p>

              <div className="space-y-2">
                <Label>
                  {language === 'zh' ? '举报类型' : 'Report Type'}
                </Label>
                <RadioGroup
                  value={reportType}
                  onValueChange={(value) => setReportType(value as ReportType)}
                  className="space-y-2"
                  disabled={isLoading}
                >
                  {reportTypes.map((type) => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={type.value} id={type.value} />
                      <Label htmlFor={type.value} className="font-normal cursor-pointer">
                        {language === 'zh' ? type.labelZh : type.labelEn}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-description">
                  {language === 'zh' ? '详细描述（可选）' : 'Description (optional)'}
                </Label>
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    language === 'zh'
                      ? '请详细描述您要举报的问题...'
                      : 'Please describe the issue in detail...'
                  }
                  rows={4}
                  disabled={isLoading}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {language === 'zh'
                  ? '注意：虚假举报可能导致您的账号受到限制'
                  : 'Note: False reports may result in account restrictions'}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {language === 'zh' ? '取消' : 'Cancel'}
          </AlertDialogCancel>
          <Button
            variant="secondary"
            onClick={handleReport}
            disabled={isLoading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isLoading
              ? (language === 'zh' ? '提交中...' : 'Submitting...')
              : (language === 'zh' ? '提交举报' : 'Submit Report')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
