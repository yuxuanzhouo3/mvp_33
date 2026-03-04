export type Language = 'en' | 'zh'

export const translations = {
  en: {
    // Navigation
    messages: 'Messages',
    channels: 'Channels',
    contacts: 'Contacts',
    workspaceMembers: 'Workspace Members',
    noWorkspaceMembers: 'No other members in this workspace',
    
    // Workspace
    workspaceSettings: 'Workspace settings',
    invitePeople: 'Invite people',
    signOut: 'Sign out',
    
    // User
    profileSettings: 'Profile settings',
    preferences: 'Preferences',
    
    // Chat
    typeMessage: 'Type a message...',
    send: 'Send',
    newConversation: 'New Conversation',
    searchConversations: 'Search conversations...',
    viewContacts: 'View Contacts',
    noConversationSelected: 'No conversation selected',
    selectConversationToStart: 'Select a conversation to start messaging',
    muteNotifications: 'Mute notifications',
    pinConversation: 'Pin conversation',
    viewDetails: 'View details',
    leaveConversation: 'Leave conversation',
    members: 'members',
    justNow: 'Just now',
    
    // Message input
    enterToSend: 'Enter',
    shiftEnterNewLine: 'Shift',
    toSend: 'to send',
    forNewLine: 'for new line',
    pressEnterToSend: 'Press Enter to send',
    shiftEnterForNewLine: 'Shift + Enter for new line',
    
    // Message list
    today: 'Today',
    yesterday: 'Yesterday',
    edited: '(edited)',
    
    // Contacts
    allContacts: 'All Contacts',
    departments: 'Departments',
    startChat: 'Start Chat',
    viewProfile: 'View Profile',
    sendMessage: 'Send Message',
    contactInformation: 'Contact Information',
    workInformation: 'Work Information',
    noContactSelected: 'No Contact Selected',
    selectContactToViewDetails: 'Select Contact to View Details',
    noFavoriteContacts: 'No Favorite Contacts',
    all: 'All',
    favorites: 'Favorites',
    noFavorites: 'No Favorites',
    searchContacts: 'Search Contacts...',
    status: 'Status',
    online: 'Online',
    offline: 'Offline',
    away: 'Away',
    busy: 'Busy',
    message: 'Message',
    call: 'Call',
    video: 'Video',
    username: 'Username',
    department: 'Department',
    title: 'Title',
    phone: 'Phone',
    
    // Channels
    allChannels: 'All Channels',
    myChannels: 'My Channels',
    createChannel: 'Create Channel',
    channelName: 'Channel Name',
    description: 'Description',
    privacy: 'Privacy',
    publicChannel: 'Public',
    privateChannel: 'Private',
    joinChannel: 'Join Channel',
    browseChannels: 'Browse Channels',
    searchChannels: 'Search channels...',
    noChannelSelected: 'No Channel Selected',
    selectChannelToViewMessages: 'Select Channel to View Messages',
    channelsAndGroups: 'Channels & Groups',
    noChannelsOrGroupsFound: 'No channels or groups found',
    createNewChannel: 'Create a new channel for your workspace',
    channelNamePlaceholder: 'e.g. general, marketing, engineering',
    channelDescriptionPlaceholder: 'What is this channel about?',
    privateChannelDescription: 'Only invited members can view and join',
    publicChannels: 'Public Channels',
    privateChannels: 'Private Channels',
    groups: 'Groups',

    // New Conversation
    startDirectOrGroup: 'Start a direct message or create a group chat',
    directMessage: 'Direct Message',
    groupChat: 'Group Chat',
    searchUsers: 'Search users...',
    enterGroupName: 'Enter group name...',
    groupName: 'Group Name',
    addMembers: 'Add Members',
    selected: 'selected',
    
    // Add Contact
    addContact: 'Add Contact',
    searchForUserOrManual: 'Search for a user or manually add a contact',
    searchUser: 'Search User',
    manualAdd: 'Manual Add',
    nameUsernameOrEmail: 'Name, username, or email...',
    startTypingToSearch: 'Start typing to search for users',
    typeAtLeast2Chars: 'Type at least 2 characters to search',
    keepTypingToSearch: 'Keep typing to search',
    noUsersFound: 'No users found',
    tryDifferentSearch: 'Try a different search term',
    searching: 'Searching...',
    fullName: 'Full Name',
    phoneOptional: 'Phone (Optional)',
    companyOptional: 'Company/Organization (Optional)',
    notesOptional: 'Notes (Optional)',
    additionalInfoPlaceholder: 'Additional information about this contact...',
    
    // Common
    search: 'Search',
    cancel: 'Cancel',
    create: 'Create',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    optional: 'optional',
    
    // Call-related
    voiceCall: 'Voice Call',
    videoCall: 'Video Call',
    calling: 'Calling...',
    callEnded: 'Call Ended',
    endCall: 'End Call',
    mute: 'Mute',
    unmute: 'Unmute',
    speaker: 'Speaker',
    screenShare: 'Screen Share',
    participants: 'participants',
    voiceMessage: 'Voice Message',
    recording: 'Recording...',
    recordingStopped: 'Recording stopped',
    deleteRecording: 'Delete',
    sendRecording: 'Send',
    stopRecording: 'Stop',
    
    // Message types
    messageTypeImage: '📷 Image',
    messageTypeVideo: '🎥 Video',
    messageTypeAudio: '🎙️ Audio',
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
    refreshing: 'Refreshing...',
    requests: 'Requests',
    
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
    noPendingContactRequests: 'No pending contact requests',
    accept: 'Accept',
    reject: 'Reject',
    ok: 'OK',
    
    // Delete contact
    deleteContact: 'Delete Contact',
    deleteContactDescription: 'Are you sure you want to remove {name} from your contacts? You will need to send a new friend request to add them back.',

    // QR Code
    myQRCode: 'My QR Code',
    scanQRCode: 'Scan QR Code',
    scanToAddFriend: 'Scan this QR code to add me as a friend',
    cameraPermissionDenied: 'Camera permission is required to scan QR codes',
    invalidQRCode: 'This is not a valid OrbitChat QR code',
    userNotFound: 'User not found or has been deactivated',
    alreadyFriend: 'This user is already your friend',
    crossRegionNotAllowed: 'Cannot add users from different regions',
    networkError: 'Network error, please try again',
    cameraError: 'Failed to access camera',
    scanningQRCode: 'Scanning QR code...',
    retry: 'Retry',
    loading: 'Loading...',

    // File preview
    filePreview: 'File Preview',
    previewNotAvailable: 'Preview not available for this file type',
    downloadFile: 'Download File',
    
    // Delete conversation
    deleteConversation: 'Delete Conversation',
    deleteConversationDescriptionDirect: 'Are you sure you want to delete this conversation?',
    deleteConversationDescriptionGroup: 'Are you sure you want to delete this conversation?',
    
    // Auth
    signIn: 'Sign In',
    signInWith: 'Sign in with',
    wechat: 'WeChat',
    google: 'Google',
    email: 'Email',
    password: 'Password',
    emailPlaceholder: 'you@company.com',
    enterCredentials: 'Enter your credentials to access your workspace',
    quickDemo: 'Quick Demo Login',
    signingIn: 'Signing in...',
    invalidCredentials: 'Invalid email or password',
    or: 'Or continue with',
    forgotPassword: 'Forgot password?',
    noAccount: 'Don\'t have an account?',
    createAccount: 'Create one',
    register: 'Register',
    confirmPassword: 'Confirm Password',
    alreadyHaveAccount: 'Already have an account?',
    signInHere: 'Sign in here',
    
    // Workspace selector
    selectWorkspace: 'Select Workspace',
    chooseWorkspace: 'Choose a workspace to continue',
    createNewWorkspace: 'Create New Workspace',
    workspaceName: 'Workspace Name',

    // Slack Mode - Block & Report
    blockUser: 'Block User',
    unblockUser: 'Unblock User',
    blockUserDescription: 'Are you sure you want to block {name}? After blocking, neither of you will be able to send messages to each other.',
    blockReason: 'Reason (optional)',
    blockReasonPlaceholder: 'Enter reason...',
    confirmBlock: 'Block',
    blocked: 'Blocked',
    blockedUsers: 'Blocked Users',
    noBlockedUsers: 'No blocked users',

    reportUser: 'Report User',
    reportUserDescription: 'You are reporting {name}',
    reportType: 'Report Type',
    reportSpam: 'Spam',
    reportHarassment: 'Harassment',
    reportInappropriate: 'Inappropriate Content',
    reportOther: 'Other',
    reportDescription: 'Description (optional)',
    reportDescriptionPlaceholder: 'Please describe the issue in detail...',
    submitReport: 'Submit Report',
    reportSubmitted: 'Report submitted successfully',

    // Privacy Settings
    privacySettings: 'Privacy Settings',
    allowNonFriendMessages: 'Allow Non-Friend Messages',
    allowNonFriendMessagesDescription: 'When disabled, only your friends can send you direct messages',
    privacySettingsUpdated: 'Privacy settings updated',

    // Global Announcement & Blind Zone
    globalAnnouncement: 'Global Announcement',
    blindZone: 'Blind Zone',
    blindZoneDesc: 'Anonymous chat',
    officialChannels: 'Official Channels',
    typeAnonymousMessage: 'Speak anonymously...',
    live: 'Live',

    // Blind Zone Chat
    blindZoneTitle: 'Blind Zone',
    blindZoneSubtitle: 'Anonymous chat within workspace',
    anonymous: 'Anonymous',
    noBlindZoneMessages: 'No messages yet. Be the first to speak anonymously!',
    blindZoneMessageDeleted: 'This message has been deleted by admin',
    blindZoneAdminDelete: 'Delete message',
    blindZoneAdminOnly: 'Admin only',

    // Invite Members
    inviteMembers: 'Invite Members',
    inviteCodeLabel: 'Invite Code',
    copyInviteCode: 'Copy Code',
    inviteCodeDescription: 'Share this invite code with new members to join your organization',
    enterCodeToJoin: 'New members can enter this code in "Join Organization"',
    noInviteCode: 'No invite code available for this workspace',

    // Join Workspace
    joinReason: 'Reason (optional)',
    joinReasonPlaceholder: 'Tell us why you want to join...',
  },
  zh: {
    // Navigation
    messages: '消息',
    channels: '频道',
    contacts: '通讯录',
    workspaceMembers: '工作区成员',
    noWorkspaceMembers: '此工作区暂无其他成员',
    
    // Workspace
    workspaceSettings: '工作区设置',
    invitePeople: '邀请成员',
    signOut: '退出登录',
    
    // User
    profileSettings: '个人设置',
    preferences: '偏好设置',
    
    // Chat
    typeMessage: '输入消息...',
    send: '发送',
    newConversation: '新建会话',
    searchConversations: '搜索会话...',
    viewContacts: '查看联系人',
    noConversationSelected: '未选择会话',
    selectConversationToStart: '选择一个会话开始聊天',
    muteNotifications: '静音通知',
    pinConversation: '置顶会话',
    viewDetails: '查看详情',
    leaveConversation: '退出会话',
    members: '位成员',
    justNow: '刚刚',
    
    // Message input
    enterToSend: '按',
    shiftEnterNewLine: 'Shift',
    toSend: '发送',
    forNewLine: '换行',
    pressEnterToSend: '按 Enter 发送',
    shiftEnterForNewLine: 'Shift + Enter 换行',
    
    // Message list
    today: '今天',
    yesterday: '昨天',
    edited: '(已编辑)',
    messageRecalled: '此消息已被撤回',
    
    // Message types
    messageTypeImage: '📷 图片',
    messageTypeVideo: '🎥 视频',
    messageTypeAudio: '🎙️ 音频',
    messageTypeFile: '📎 文件',
    messageTypeCode: '💻 代码',
    messageDeleted: '消息已删除',
    pinMessage: '置顶消息',
    unpinMessage: '取消置顶',
    hideMessage: '隐藏消息',
    show: '显示',
    copy: '复制',
    copied: '已复制',
    recall: '撤回',
    
    // Contacts
    allContacts: '所有联系人',
    departments: '部门',
    startChat: '发起聊天',
    viewProfile: '查看资料',
    sendMessage: '发送消息',
    contactInformation: '联系信息',
    workInformation: '工作信息',
    
    // Contact requests
    contactRequestSent: '好友申请已发送',
    contactRequestSentDescription: '您的好友申请已成功发送。',
    weAreNowFriends: '我们现在是好友了。',
    noPendingContactRequests: '暂无待处理的好友申请',
    accept: '接受',
    reject: '拒绝',
    ok: '确定',
    
    noContactSelected: '未选择联系人',
    selectContactToViewDetails: '选择联系人查看详情',
    noFavoriteContacts: '暂无收藏联系人',
    all: '全部',
    favorites: '收藏',
    noFavorites: '暂无收藏',
    searchContacts: '搜索联系人...',
    status: '状态',
    online: '在线',
    offline: '离线',
    away: '离开',
    busy: '忙碌',
    message: '消息',
    call: '通话',
    video: '视频',
    username: '用户名',
    department: '部门',
    title: '职位',
    phone: '电话',
    
    // Channels
    allChannels: '所有频道',
    myChannels: '我的频道',
    createChannel: '创建频道',
    channelName: '频道名称',
    description: '描述',
    privacy: '隐私',
    publicChannel: '公开',
    privateChannel: '私密',
    joinChannel: '加入频道',
    browseChannels: '浏览频道',
    searchChannels: '搜索频道...',
    noChannelSelected: '未选择频道',
    selectChannelToViewMessages: '选择频道查看消息',
    channelsAndGroups: '频道和群组',
    noChannelsOrGroupsFound: '未找到频道或群组',
    createNewChannel: '为你的工作区创建新频道',
    channelNamePlaceholder: '例如：general, marketing, engineering',
    channelDescriptionPlaceholder: '这个频道是关于什么的？',
    privateChannelDescription: '只有被邀请的成员可以查看和加入',
    publicChannels: '公开频道',
    privateChannels: '私密频道',
    groups: '群组',

    // New Conversation
    startDirectOrGroup: '开始私聊或创建群聊',
    directMessage: '私聊',
    groupChat: '群聊',
    searchUsers: '搜索用户...',
    enterGroupName: '输入群组名称...',
    groupName: '群组名称',
    addMembers: '添加成员',
    selected: '已选择',
    
    // Add Contact
    addContact: '添加联系人',
    searchForUserOrManual: '搜索用户或手动添加联系人',
    searchUser: '搜索用户',
    manualAdd: '手动添加',
    nameUsernameOrEmail: '姓名、用户名或邮箱...',
    startTypingToSearch: '开始输入以搜索用户',
    typeAtLeast2Chars: '至少输入2个字符以搜索',
    keepTypingToSearch: '继续输入以搜索',
    noUsersFound: '未找到用户',
    tryDifferentSearch: '尝试其他搜索词',
    searching: '搜索中...',
    fullName: '全名',
    phoneOptional: '电话（可选）',
    companyOptional: '公司/组织（可选）',
    notesOptional: '备注（可选）',
    additionalInfoPlaceholder: '关于此联系人的其他信息...',
    
    // Common
    search: '搜索',
    cancel: '取消',
    create: '创建',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    optional: '可选',
    
    // Call-related
    voiceCall: '语音通话',
    videoCall: '视频通话',
    calling: '呼叫中...',
    callEnded: '通话结束',
    endCall: '结束通话',
    mute: '静音',
    unmute: '取消静音',
    speaker: '扬声器',
    screenShare: '共享屏幕',
    participants: '位参与者',
    voiceMessage: '语音消息',
    recording: '录音中...',
    recordingStopped: '录音已停止',
    deleteRecording: '删除',
    sendRecording: '发送',
    stopRecording: '停止',
    
    // Auth
    signIn: '登录',
    signInWith: '使用 {method} 登录',
    wechat: '微信',
    google: '谷歌',
    email: '邮箱',
    password: '密码',
    emailPlaceholder: 'you@company.com',
    enterCredentials: '输入您的凭据以访问工作区',
    quickDemo: '快速演示登录',
    signingIn: '登录中...',
    invalidCredentials: '邮箱或密码无效',
    or: '或继续使用',
    forgotPassword: '忘记密码？',
    noAccount: '没有账号？',
    createAccount: '立即注册',
    register: '注册',
    confirmPassword: '确认密码',
    alreadyHaveAccount: '已有账号？',
    signInHere: '立即登录',
    
    // Workspace selector
    selectWorkspace: '选择工作区',
    chooseWorkspace: '选择一个工作区以继续',
    createNewWorkspace: '创建新工作区',
    workspaceName: '工作区名称',

    // Slack Mode - Block & Report
    blockUser: '屏蔽用户',
    unblockUser: '取消屏蔽',
    blockUserDescription: '确定要屏蔽 {name} 吗？屏蔽后，双方将无法互相发送消息。',
    blockReason: '屏蔽原因（可选）',
    blockReasonPlaceholder: '请输入屏蔽原因...',
    confirmBlock: '确认屏蔽',
    blocked: '已屏蔽',
    blockedUsers: '已屏蔽的用户',
    noBlockedUsers: '暂无已屏蔽的用户',

    reportUser: '举报用户',
    reportUserDescription: '您正在举报 {name}',
    reportType: '举报类型',
    reportSpam: '垃圾信息',
    reportHarassment: '骚扰',
    reportInappropriate: '不当内容',
    reportOther: '其他',
    reportDescription: '详细描述（可选）',
    reportDescriptionPlaceholder: '请详细描述您要举报的问题...',
    submitReport: '提交举报',
    reportSubmitted: '举报提交成功',

    // Privacy Settings
    privacySettings: '隐私设置',
    allowNonFriendMessages: '允许非好友发消息',
    allowNonFriendMessagesDescription: '关闭后，只有您的好友才能直接向您发送消息',
    privacySettingsUpdated: '隐私设置已更新',

    // Global Announcement & Blind Zone
    globalAnnouncement: '全员公告',
    blindZone: '盲区动态',
    blindZoneDesc: '极速交流/高活',
    officialChannels: '官方频道',
    typeAnonymousMessage: '匿名发言，快速点击...',
    live: '实时',

    // Blind Zone Chat
    blindZoneTitle: '盲区交流',
    blindZoneSubtitle: '工作区内匿名交流',
    anonymous: '无名氏',
    noBlindZoneMessages: '暂无消息，成为第一个匿名发言的人吧！',
    blindZoneMessageDeleted: '此消息已被管理员删除',
    blindZoneAdminDelete: '删除消息',
    blindZoneAdminOnly: '仅管理员',

    // Conversation list
    noConversationsYet: '暂无会话',
    startNewConversation: '开始新会话',
    loadingConversations: '加载会话中...',
    refreshing: '刷新中...',
    requests: '请求',

    // Delete contact
    deleteContact: '删除联系人',
    deleteContactDescription: '确定要将 {name} 从联系人中移除吗？您需要重新发送好友请求才能再次添加。',

    // QR Code
    myQRCode: '我的二维码',
    scanQRCode: '扫一扫',
    scanToAddFriend: '扫描此二维码添加我为好友',
    cameraPermissionDenied: '需要摄像头权限才能扫描二维码',
    invalidQRCode: '这不是有效的OrbitChat二维码',
    userNotFound: '该用户不存在或已注销',
    alreadyFriend: '该用户已经是您的好友',
    crossRegionNotAllowed: '无法添加不同区域的用户',
    networkError: '网络错误，请稍后重试',
    cameraError: '无法访问摄像头',
    scanningQRCode: '正在扫描二维码...',
    retry: '重试',
    loading: '加载中...',

    // File preview
    filePreview: '文件预览',
    previewNotAvailable: '此文件类型无法预览',
    downloadFile: '下载文件',

    // Delete conversation
    deleteConversation: '删除会话',
    deleteConversationDescriptionDirect: '确定要删除此会话吗？',
    deleteConversationDescriptionGroup: '确定要删除此会话吗？',

    // Message status
    noMessages: '暂无消息',
    systemMessage: '系统消息',
    addReaction: '添加表情',
    pinned: '已置顶',

    // Invite Members
    inviteMembers: '邀请成员',
    inviteCodeLabel: '邀请码',
    copyInviteCode: '复制邀请码',
    inviteCodeDescription: '分享以下邀请码给新成员，他们可以通过邀请码加入组织',
    enterCodeToJoin: '新成员可在"加入组织"中输入此邀请码',
    noInviteCode: '当前工作区暂无邀请码',

    // Join Workspace
    joinReason: '申请原因（可选）',
    joinReasonPlaceholder: '请说明您想加入的原因...',
  }
}

export function getTranslation(language: Language, key: keyof typeof translations.en): string {
  const current = translations[language] as Record<string, string>
  return current[key] || translations.en[key]
}
