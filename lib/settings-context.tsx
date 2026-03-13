'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { DEFAULT_LANGUAGE, DEFAULT_REGION } from '@/config'

type Language = 'en' | 'zh'
type Theme = 'light' | 'dark' | 'monokai' | 'solarized-dark' | 'light-purple' | 'light-yellow'

interface SettingsContextType {
  language: Language
  theme: Theme
  setLanguage: (language: Language) => void
  setTheme: (theme: Theme) => void
  t: (key: string) => string
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

const LEGACY_LANGUAGE_STORAGE_KEY = 'language'

const resolveClientRegion = (): 'cn' | 'global' => {
  if (typeof window === 'undefined') return DEFAULT_REGION
  const host = window.location.hostname.toLowerCase()
  if (host.includes('mornscience.top')) {
    return 'cn'
  }
  if (host.includes('mornscience.work')) {
    return 'global'
  }
  return DEFAULT_REGION
}

const resolveClientDefaultLanguage = (): Language =>
  resolveClientRegion() === 'cn' ? 'zh' : 'en'

const getLanguageStorageKey = () => `language_${resolveClientRegion()}`

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 初始语言从构建配置读取
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE as Language)
  const [theme, setThemeState] = useState<Theme>('light')

  // Apply theme based on user choice
  const applyTheme = (theme: Theme) => {
    if (typeof window === 'undefined') return

    // Remove all theme classes first
    document.documentElement.classList.remove('dark', 'theme-monokai', 'theme-solarized-dark', 'theme-light-purple', 'theme-light-yellow')

    // Apply theme class
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'monokai') {
      document.documentElement.classList.add('dark', 'theme-monokai')
    } else if (theme === 'solarized-dark') {
      document.documentElement.classList.add('dark', 'theme-solarized-dark')
    } else if (theme === 'light-purple') {
      document.documentElement.classList.add('theme-light-purple')
    } else if (theme === 'light-yellow') {
      document.documentElement.classList.add('theme-light-yellow')
    }
    // 'light' theme: no classes needed (default)
  }

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 只在客户端读取用户偏好，但不影响环境
    const languageStorageKey = getLanguageStorageKey()
    const savedLanguage = localStorage.getItem(languageStorageKey) as Language
    const legacyLanguage = localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY) as Language
    const savedTheme = localStorage.getItem('theme') as Theme

    const isValidLanguage = (value: string | null): value is Language =>
      value === 'zh' || value === 'en'

    // 语言设置仅用于 UI 显示，不影响认证方式和数据库选择
    if (isValidLanguage(savedLanguage)) {
      setLanguageState(savedLanguage)
    } else if (isValidLanguage(legacyLanguage)) {
      setLanguageState(legacyLanguage)
      localStorage.setItem(languageStorageKey, legacyLanguage)
    } else {
      const defaultLanguage = resolveClientDefaultLanguage()
      setLanguageState(defaultLanguage)
      localStorage.setItem(languageStorageKey, defaultLanguage)
    }

    if (savedTheme) {
      setThemeState(savedTheme)
      applyTheme(savedTheme)
    } else {
      // Default to light if no saved theme
      setThemeState('light')
      applyTheme('light')
    }
  }, [])

  // 语言切换不触发环境切换
  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage)
    if (typeof window !== 'undefined') {
      const languageStorageKey = getLanguageStorageKey()
      localStorage.setItem(languageStorageKey, newLanguage)
      // Keep legacy key for compatibility with existing pages/components.
      localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, newLanguage)
    }
  }
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  }

  const t = (key: string): string => {
    const translations: Record<Language, Record<string, string>> = {
      en: {
        messages: 'Messages',
        channels: 'Channels',
        contacts: 'Contacts',
        workspaceSettings: 'Workspace settings',
        invitePeople: 'Invite people',
        signOut: 'Sign out',
        profileSettings: 'Profile settings',
        preferences: 'Preferences',
        notifications: 'Notifications',
        language: 'Language',
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        monokai: 'Monokai',
        'solarized-dark': 'Solarized Dark',
        'light-purple': 'Light Purple',
        'light-yellow': 'Light Yellow',
        // Payment page
        currentMembership: 'Current membership',
        daysRemaining: 'days remaining',
        chooseYourPlan: 'Choose your plan',
        allProPlansInclude: 'All Pro plans include unlimited messages, storage, and collaboration features.',
        youAlreadyHaveActive: 'You already have an active Pro subscription',
        detectingYourRegion: 'Detecting your region...',
        availablePaymentMethods: 'Available payment methods:',
        yearly: 'Yearly',
        monthly: 'Monthly',
        popular: 'Popular',
        paymentDetails: 'Payment details',
        orderNo: 'Order No:',
        paying: 'Paying',
        forPlan: 'for',
        changeMethod: 'Change method',
        paymentMethod: 'Payment method',
        total: 'Total',
        payWith: 'Pay with',
        processing: 'Processing...',
        noPaymentMethodAvailable: 'No payment method available',
        paymentSuccessful: 'Payment successful',
        proMembershipActive: 'Your Pro membership is now active.',
        youHave: 'You have',
        daysRemainingText: 'days remaining.',
        goToChat: 'Go to chat',
        // Preferences page
        customizeAppLanguage: 'Customize your app language and appearance',
        languageAndTheme: 'Language & Theme',
        manageNotificationPreferences: 'Manage your notification preferences',
        notificationSettingsComingSoon: 'Notification settings coming soon...',
        // Profile page
        editWorkInformation: 'Edit your work information and profile',
        profilePicture: 'Profile Picture',
        uploadProfilePicture: 'Upload a profile picture to personalize your account',
        avatar: 'Avatar',
        uploadImage: 'Upload Image',
        changeImage: 'Change Image',
        remove: 'Remove',
        imageFormatHint: 'JPG, PNG or GIF. Max size 5MB.',
        profileInformation: 'Profile Information',
        fullName: 'Full Name',
        department: 'Department',
        title: 'Title',
        phone: 'Phone',
        save: 'Save',
        saving: 'Saving...',
        uploading: 'Uploading...',
        loading: 'Loading...',
        // Payment page features
        unlimitedMessages: 'Unlimited messages',
        unlimitedMessagesCapital: 'Unlimited Messages',
        storage100GB: '100GB storage',
        storage1TB: '1TB storage',
        storage1TBCapital: '1TB Storage',
        unlimitedWorkspaces: 'Unlimited workspaces',
        unlimitedWorkspacesCapital: 'Unlimited Workspaces',
        unlimitedMembers: 'Unlimited members',
        unlimitedMembersCapital: 'Unlimited Members',
        prioritySupport: 'Priority support',
        prioritySupportCapital: 'Priority Support',
        saveAmount: 'Save',
        // Payment methods descriptions
        payWithWeChatQR: 'Pay quickly with a WeChat QR code',
        idealForPayments: 'Ideal for both personal and business payments',
        payWithCreditCard: 'Pay with credit or debit card',
        payWithPayPalAccount: 'Pay with your PayPal account',
        recommended: 'Recommended',
        secure: 'Secure',
        // Toast messages
        invalidFile: 'Invalid file',
        pleaseSelectImage: 'Please select an image file',
        fileTooLarge: 'File too large',
        imageSizeMustBeLess: 'Image size must be less than 5MB',
        noFileSelected: 'No file selected',
        success: 'Success',
        avatarUploadedSuccessfully: 'Avatar uploaded successfully',
        avatarRemovedSuccessfully: 'Avatar removed successfully',
        profileUpdatedSuccessfully: 'Profile updated successfully',
        error: 'Error',
        failedToUploadAvatar: 'Failed to upload avatar. Please try again.',
        failedToRemoveAvatar: 'Failed to remove avatar. Please try again.',
        failedToSave: 'Failed to save. Please try again.',
        areYouSureRemoveAvatar: 'Are you sure you want to remove your avatar?',
        // Message types
        messageTypeImage: '📷 Image',
        messageTypeVideo: '🎥 Video',
        messageTypeAudio: '🎙️ Voice',
        messageTypeFile: '📎 File',
        messageTypeCode: '💻 Code',
        // Message status
        messageRecalled: 'Message recalled',
        messageDeleted: 'Message removed',
        noMessages: 'No messages',
        systemMessage: 'System message',
        // Conversation list
        noConversationsYet: 'No conversations yet',
        startNewConversation: 'Start a new conversation to get started',
        loadingConversations: 'Loading conversations...',
        // Context menu
        pinMessage: 'Pin Message',
        unpinMessage: 'Unpin Message',
        hideMessage: 'Hide Message',
        show: 'Show',
        copy: 'Copy',
        copied: 'Copied',
        recall: 'Recall',
        addReaction: 'Add Reaction',
        pinned: 'Pinned',
        // Edit/Delete dialogs
        editMessage: 'Edit Message',
        deleteMessage: 'Delete',
        deleteMessageConfirm: 'Are you sure you want to delete this message?',
        deleteMessageForMe: 'Delete for me',
        // Contact requests
        contactRequestSent: 'Contact request sent',
        contactRequestSentDescription: 'Your contact request has been sent successfully.',
        weAreNowFriends: 'We are now friends.',
        // Delete contact
        deleteContact: 'Delete Contact',
        deleteContactDescription: 'Are you sure you want to remove {name} from your contacts? You will need to send a new friend request to add them back.',
        // File preview
        filePreview: 'File Preview',
        previewNotAvailable: 'Preview not available for this file type',
        downloadFile: 'Download File',
        // Delete conversation
        deleteConversation: 'Delete Conversation',
        deleteConversationDescriptionDirect: 'Are you sure you want to delete this conversation?',
        deleteConversationDescriptionGroup: 'Are you sure you want to delete this conversation?',
      },
      zh: {
        messages: '消息',
        channels: '频道',
        contacts: '通讯录',
        workspaceSettings: '工作区设置',
        invitePeople: '邀请成员',
        signOut: '退出登录',
        preferences: '偏好设置',
        notifications: '通知',
        language: '语言',
        theme: '主题',
        light: '浅色',
        dark: '深色',
        monokai: 'Monokai',
        'solarized-dark': 'Solarized 深色',
        'light-purple': '浅色紫',
        'light-yellow': '浅色黄',
        // Payment page
        currentMembership: '当前会员',
        daysRemaining: '剩余天数',
        chooseYourPlan: '选择您的方案',
        allProPlansInclude: '所有 Pro 方案包括无限消息、存储和协作功能。',
        youAlreadyHaveActive: '您已有活跃的 Pro 订阅',
        detectingYourRegion: '正在检测您的地区...',
        availablePaymentMethods: '可用支付方式：',
        yearly: '年度',
        monthly: '月度',
        popular: '热门',
        paymentDetails: '支付详情',
        orderNo: '订单号：',
        paying: '支付',
        forPlan: '用于',
        changeMethod: '更改方式',
        paymentMethod: '支付方式',
        total: '总计',
        payWith: '使用',
        processing: '处理中...',
        noPaymentMethodAvailable: '无可用支付方式',
        paymentSuccessful: '支付成功',
        proMembershipActive: '您的 Pro 会员现已激活。',
        youHave: '您有',
        daysRemainingText: '剩余天数。',
        goToChat: '前往聊天',
        // Preferences page
        customizeAppLanguage: '自定义您的应用语言和外观',
        languageAndTheme: '语言和主题',
        manageNotificationPreferences: '管理您的通知偏好',
        notificationSettingsComingSoon: '通知设置即将推出...',
        // Profile page
        profileSettings: '个人设置',
        editWorkInformation: '编辑您的工作信息和个人资料',
        profilePicture: '头像',
        uploadProfilePicture: '上传头像以个性化您的账户',
        avatar: '头像',
        uploadImage: '上传图片',
        changeImage: '更换图片',
        remove: '删除',
        imageFormatHint: 'JPG、PNG 或 GIF。最大 5MB。',
        profileInformation: '个人信息',
        fullName: '姓名',
        department: '部门',
        title: '职位',
        phone: '电话',
        save: '保存',
        saving: '保存中...',
        uploading: '上传中...',
        loading: '加载中...',
        // Payment page features
        unlimitedMessages: '无限消息',
        unlimitedMessagesCapital: '无限消息',
        storage100GB: '100GB 存储',
        storage1TB: '1TB 存储',
        storage1TBCapital: '1TB 存储',
        unlimitedWorkspaces: '无限工作区',
        unlimitedWorkspacesCapital: '无限工作区',
        unlimitedMembers: '无限成员',
        unlimitedMembersCapital: '无限成员',
        prioritySupport: '优先支持',
        prioritySupportCapital: '优先支持',
        saveAmount: '节省',
        // Payment methods descriptions
        payWithWeChatQR: '使用微信二维码快速支付',
        idealForPayments: '适合个人和企业支付',
        payWithCreditCard: '使用信用卡或借记卡支付',
        payWithPayPalAccount: '使用您的 PayPal 账户支付',
        recommended: '推荐',
        secure: '安全',
        // Toast messages
        invalidFile: '无效文件',
        pleaseSelectImage: '请选择图片文件',
        fileTooLarge: '文件过大',
        imageSizeMustBeLess: '图片大小必须小于 5MB',
        noFileSelected: '未选择文件',
        success: '成功',
        avatarUploadedSuccessfully: '头像上传成功',
        avatarRemovedSuccessfully: '头像删除成功',
        profileUpdatedSuccessfully: '个人资料更新成功',
        error: '错误',
        failedToUploadAvatar: '上传头像失败，请重试。',
        failedToRemoveAvatar: '删除头像失败，请重试。',
        failedToSave: '保存失败，请重试。',
        areYouSureRemoveAvatar: '您确定要删除头像吗？',
        // Message types
        messageTypeImage: '📷 图片',
        messageTypeVideo: '🎥 视频',
        messageTypeAudio: '🎙️ 语音',
        messageTypeFile: '📎 文件',
        messageTypeCode: '💻 代码',
        // Message status
        messageRecalled: '消息已撤回',
        messageDeleted: '消息已删除',
        noMessages: '暂无消息',
        systemMessage: '系统消息',
        // Conversation list
        noConversationsYet: '暂无会话',
        startNewConversation: '开始新会话',
        loadingConversations: '加载会话中...',
        // Context menu
        pinMessage: '置顶消息',
        unpinMessage: '取消置顶',
        hideMessage: '隐藏消息',
        show: '显示',
        copy: '复制',
        copied: '已复制',
        recall: '撤回',
        addReaction: '添加反应',
        pinned: '已置顶',
        // Edit/Delete dialogs
        editMessage: '编辑消息',
        deleteMessage: '删除',
        deleteMessageConfirm: '确定要删除这条消息吗？',
        deleteMessageForMe: '仅删除给我',
        // Contact requests
        contactRequestSent: '好友申请已发送',
        contactRequestSentDescription: '您的好友申请已成功发送。',
        weAreNowFriends: '我们已经是好友了。',
        // Delete contact
        deleteContact: '删除联系人',
        deleteContactDescription: '确定要从联系人中移除 {name} 吗？您需要重新发送好友申请才能添加他们。',
        // File preview
        filePreview: '文件预览',
        previewNotAvailable: '此文件类型不支持预览',
        downloadFile: '下载文件',
        // Delete conversation
        deleteConversation: '删除会话',
        deleteConversationDescriptionDirect: '确定要删除此会话吗？',
        deleteConversationDescriptionGroup: '确定要删除此会话吗？',
      }
    }
    
    return translations[language]?.[key] || key
  }

  return (
    <SettingsContext.Provider value={{ language, theme, setLanguage, setTheme, t }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}



