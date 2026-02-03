'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAvatarColor } from '@/lib/avatar-utils'
import { useToast } from '@/hooks/use-toast'
import { Save, Upload, X } from 'lucide-react'
import { User } from '@/lib/types'
import { mockAuth } from '@/lib/mock-auth'
import { useSettings } from '@/lib/settings-context'

export default function ProfileSettingsPage() {
  const { t } = useSettings()
  const router = useRouter()
  const { toast, toasts } = useToast()
  const [profile, setProfile] = useState<Partial<User>>({})
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null) // Current avatar URL from server
  const [displayUrl, setDisplayUrl] = useState<string | null>(null) // URL currently displayed (only changes after image loads)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasInitializedRef = useRef(false) // Track if we've initialized
  const loadingImageRef = useRef<string | null>(null) // Track which image is currently loading

  // Load user profile - only from localStorage, never from API to avoid conflicts
  useEffect(() => {
    // Only run once
    if (hasInitializedRef.current) {
      return
    }
    hasInitializedRef.current = true

    // Load from localStorage only - no API calls to avoid conflicts with manual updates
    const cachedUser = mockAuth.getCurrentUser()
    if (cachedUser) {
      setProfile(cachedUser)
      const url = cachedUser.avatar_url || null
      setAvatarUrl(url)
      setDisplayUrl(url) // Set display URL immediately - assume existing images are already loaded
      setIsLoadingProfile(false)
    } else {
      // No cached user, set empty states
      setAvatarUrl(null)
      setDisplayUrl(null)
      setIsLoadingProfile(false)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const toastId = toast({
        title: t('invalidFile'),
        description: t('pleaseSelectImage'),
        variant: 'destructive',
      })
      setTimeout(() => toastId.dismiss(), 3000)
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      const toastId = toast({
        title: t('fileTooLarge'),
        description: t('imageSizeMustBeLess'),
        variant: 'destructive',
      })
      setTimeout(() => toastId.dismiss(), 3000)
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUploadAvatar = async () => {
      const file = fileInputRef.current?.files?.[0]
      if (!file) {
        const toastId = toast({
          title: t('noFileSelected'),
          description: t('pleaseSelectImage'),
          variant: 'destructive',
        })
        setTimeout(() => toastId.dismiss(), 3000)
        return
      }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/users/profile/upload-avatar', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      
      if (!response.ok || !data.success) {
        console.error('[AVATAR UPLOAD] Response error:', data)
        const errorMsg = data.details 
          ? `${data.error}: ${data.details}` 
          : data.error || `Failed to upload avatar (Status: ${response.status})`
        throw new Error(errorMsg)
      }

      // Update localStorage first (this is the source of truth)
      const currentUser = mockAuth.getCurrentUser()
      if (currentUser) {
        const updatedUser = { ...currentUser, avatar_url: data.avatar_url }
        mockAuth.setCurrentUser(updatedUser)
      }

      const newAvatarUrl = data.avatar_url
      
      // Update avatarUrl and displayUrl immediately (so Remove button shows right away)
      setAvatarUrl(newAvatarUrl)
      setDisplayUrl(newAvatarUrl) // Update immediately so Remove button appears
      
      // Clear preview immediately so Save button hides and Remove button shows
      setPreviewUrl(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      // Mark that we're loading this image (for background verification)
      loadingImageRef.current = newAvatarUrl
      
      // Preload image in background (for verification, but don't wait for it)
      const img = new Image()
      img.onload = () => {
        // Only update if this is still the image we're loading (user might have uploaded another)
        if (loadingImageRef.current === newAvatarUrl) {
          loadingImageRef.current = null
        }
        // Update profile state
        setProfile(prev => ({ ...prev, avatar_url: newAvatarUrl }))
      }
      img.onerror = () => {
        // Even if image fails, continue (might be temporary network issue)
        if (loadingImageRef.current === newAvatarUrl) {
          loadingImageRef.current = null
        }
        setProfile(prev => ({ ...prev, avatar_url: newAvatarUrl }))
      }
      
      // Start loading in background
      img.src = newAvatarUrl
      
      // Set uploading to false
      setIsUploading(false)
      
      // Show success toast with auto-dismiss
      const toastId = toast({
        title: t('success'),
        description: t('avatarUploadedSuccessfully'),
      })
      setTimeout(() => toastId.dismiss(), 3000)
    } catch (error: any) {
      console.error('Failed to upload avatar:', error)
      setIsUploading(false)
      const toastId = toast({
        title: t('error'),
        description: error.message || t('failedToUploadAvatar'),
        variant: 'destructive',
      })
      setTimeout(() => toastId.dismiss(), 3000)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!confirm(t('areYouSureRemoveAvatar'))) return

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: null }),
      })

      const data = await response.json()
      if (data.success) {
        // Update localStorage first (this is the source of truth)
        const currentUser = mockAuth.getCurrentUser()
        if (currentUser) {
          const updatedUser = { ...currentUser, avatar_url: null }
          mockAuth.setCurrentUser(updatedUser)
        }

        // Update avatar URL state immediately
        setAvatarUrl(null)
        setDisplayUrl(null)
        loadingImageRef.current = null
        
        // Update profile state
        setProfile(prev => ({ ...prev, avatar_url: null }))
        
        // Show success toast with auto-dismiss
        const toastId = toast({
          title: t('success'),
          description: t('avatarRemovedSuccessfully'),
        })
        setTimeout(() => toastId.dismiss(), 3000)
      } else {
        throw new Error(data.error || t('failedToRemoveAvatar'))
      }
    } catch (error: any) {
      console.error('Failed to remove avatar:', error)
      const toastId = toast({
        title: t('error'),
        description: error.message || t('failedToRemoveAvatar'),
        variant: 'destructive',
      })
      setTimeout(() => toastId.dismiss(), 3000)
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profile.full_name || '',
          department: profile.department || '',
          title: profile.title || '',
          phone: profile.phone || '',
          // Don't send avatar_url - only update it when user explicitly uploads/removes
        }),
      })
      
      // Check response status first
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[PROFILE SAVE] API error:', {
          status: response.status,
          statusText: response.statusText,
          data: errorData,
        })
        throw new Error(errorData.error || errorData.details || `Failed to update profile (Status: ${response.status})`)
      }
      
      const data = await response.json()
      
      if (data.success) {
        // Update profile state - preserve avatar_url from current state
        setProfile(prev => ({
          ...prev,
          full_name: data.user?.full_name ?? prev.full_name,
          department: data.user?.department ?? prev.department,
          title: data.user?.title ?? prev.title,
          phone: data.user?.phone ?? prev.phone,
          // Keep existing avatar_url - don't overwrite with API response
          avatar_url: prev.avatar_url,
        }))
        
        // Update localStorage to sync with other pages
        const currentUser = mockAuth.getCurrentUser()
        if (currentUser) {
          const updatedUser = { 
            ...currentUser, 
            full_name: profile.full_name || currentUser.full_name,
            department: profile.department || currentUser.department,
            title: profile.title || currentUser.title,
            phone: profile.phone || currentUser.phone,
            // Preserve avatar_url
            avatar_url: currentUser.avatar_url,
          }
          mockAuth.setCurrentUser(updatedUser)
        }
        
        // Show success toast with auto-dismiss
        const toastId = toast({
          title: t('success'),
          description: t('profileUpdatedSuccessfully'),
        })
        setTimeout(() => toastId.dismiss(), 3000)
      } else {
        throw new Error(data.error || t('failedToSave'))
      }
    } catch (error: any) {
      console.error('Failed to save profile:', error)
      const toastId = toast({
        title: t('error'),
        description: error.message || t('failedToSave'),
        variant: 'destructive',
      })
      setTimeout(() => toastId.dismiss(), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('profileSettings')}</h1>
        <p className="text-muted-foreground">{t('editWorkInformation')}</p>
      </div>

      {/* Avatar Upload */}
      <Card className="mb-6 relative">
        <CardHeader>
          <CardTitle>{t('profilePicture')}</CardTitle>
          <CardDescription>{t('uploadProfilePicture')}</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          {/* Toast container for this card only - positioned upper right */}
          {toasts.length > 0 && (
            <div className="absolute top-1 right-8 z-50 w-full max-w-xs">
              {toasts.map(function ({ id, title, description, variant, open, onOpenChange, ...props }) {
                if (!open) return null
                const isDestructive = variant === 'destructive'
                return (
                  <div
                    key={id}
                    className={`pointer-events-auto relative flex w-full items-start justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all animate-in slide-in-from-top-2 ${
                      isDestructive
                        ? 'border-destructive bg-destructive text-destructive-foreground'
                        : 'border bg-background text-foreground'
                    }`}
                  >
                    <div className="grid gap-1 flex-1">
                      {title && <div className="text-sm font-semibold">{title}</div>}
                      {description && (
                        <div className="text-sm opacity-90">{description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-6">
            {isLoadingProfile ? (
              <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  {t('loading')}
                </div>
              </div>
            ) : (
              <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : displayUrl ? (
                  <img
                    src={displayUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center text-white font-semibold text-3xl"
                    style={{ backgroundColor: profile.full_name ? getAvatarColor(profile.full_name) : '#666' }}
                  >
                    {(profile.full_name || 'User').split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="avatar-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isLoadingProfile}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {previewUrl ? t('changeImage') : t('uploadImage')}
                </Button>
                {previewUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUploadAvatar}
                    disabled={isUploading}
                    className="gap-2"
                  >
                    {isUploading ? t('uploading') : t('save')}
                  </Button>
                )}
                {(avatarUrl || displayUrl) && !previewUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    {t('remove')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('imageFormatHint')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profileInformation')}</CardTitle>
          <CardDescription>{t('editWorkInformation')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">{t('fullName')}</Label>
              <Input
                id="full_name"
                value={profile.full_name || ''}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="e.g., John Doe"
                disabled={isLoadingProfile}
              />
            </div>
            <div>
              <Label htmlFor="department">{t('department')}</Label>
              <Input
                id="department"
                value={profile.department || ''}
                onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                placeholder="e.g., Engineering, Sales"
                disabled={isLoadingProfile}
              />
            </div>
            <div>
              <Label htmlFor="title">{t('title')}</Label>
              <Input
                id="title"
                value={profile.title || ''}
                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                placeholder="e.g., Software Engineer, Product Manager"
                disabled={isLoadingProfile}
              />
            </div>
            <div>
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input
                id="phone"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="e.g., +1 555-0000"
                disabled={isLoadingProfile}
              />
            </div>
          </div>
          <Button 
            onClick={handleSaveProfile} 
            disabled={isSaving || isLoadingProfile}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? t('saving') : t('save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

