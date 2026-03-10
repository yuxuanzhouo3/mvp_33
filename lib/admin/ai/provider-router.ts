import { getDeploymentRegion } from '@/config'
import type { AiLanguage, AiProvider, AiRegion } from '@/lib/admin/types'

export interface AiProviderRoute {
  region: AiRegion
  language: AiLanguage
  analysisProvider: AiProvider
  analysisModel: string
  posterProvider: AiProvider
  posterModel: string
  videoProvider: AiProvider
  videoModel: string
}

export function resolveAiLanguage(region: AiRegion): AiLanguage {
  return region === 'CN' ? 'zh-CN' : 'en-US'
}

export function resolveAiRegion(explicitRegion?: AiRegion): AiRegion {
  return explicitRegion ?? getDeploymentRegion()
}

export function resolveAiProviderRoute(explicitRegion?: AiRegion): AiProviderRoute {
  const region = resolveAiRegion(explicitRegion)

  if (region === 'CN') {
    return {
      region,
      language: 'zh-CN',
      analysisProvider: 'aliyun-bailian',
      analysisModel: process.env.ALIYUN_QWEN_MODEL || 'qwen-plus',
      posterProvider: 'aliyun-wanx-image',
      posterModel: process.env.ALIYUN_WAN_IMAGE_MODEL || 'wan2.5-t2i-preview',
      videoProvider: 'aliyun-wanx-video',
      videoModel: process.env.ALIYUN_WAN_VIDEO_MODEL || 'wan2.5-t2v-preview',
    }
  }

  return {
    region,
    language: 'en-US',
    analysisProvider: 'gemini',
    analysisModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-pro',
    posterProvider: 'openai',
    posterModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    videoProvider: 'gemini',
    videoModel: process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-generate-preview',
  }
}

export function getDashScopeApiBase(region: AiRegion): string {
  if (region === 'CN') {
    return process.env.DASHSCOPE_API_BASE || 'https://dashscope.aliyuncs.com/api/v1'
  }
  return process.env.DASHSCOPE_API_BASE_INTL || 'https://dashscope-intl.aliyuncs.com/api/v1'
}

export function getDashScopeCompatibleBase(region: AiRegion): string {
  if (region === 'CN') {
    return process.env.DASHSCOPE_COMPAT_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }
  return process.env.DASHSCOPE_COMPAT_BASE_INTL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
}

export function getGeminiApiBase(): string {
  return process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
}

export function getOpenAiApiBase(): string {
  return process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required AI environment variable: ${name}`)
  }
  return value
}
