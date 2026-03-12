import { Buffer } from 'node:buffer'
import type { AiLanguage, AiProvider, AiRegion } from '@/lib/admin/types'
import {
  getDashScopeApiBase,
  getDashScopeCompatibleBase,
  getGeminiApiBase,
  getOpenAiApiBase,
  getRequiredEnv,
  resolveAiProviderRoute,
} from './provider-router'

export interface TextGenerationInput {
  region: AiRegion
  language: AiLanguage
  systemPrompt: string
  userPrompt: string
  model?: string
}

export interface MediaTaskSubmission {
  status: 'completed' | 'pending'
  provider: AiProvider
  model: string
  bytes?: Buffer
  mimeType?: string
  remoteUrl?: string
  taskId?: string
  raw: any
}

export interface MediaTaskPollResult {
  status: 'pending' | 'completed' | 'failed'
  provider: AiProvider
  model: string
  bytes?: Buffer
  mimeType?: string
  remoteUrl?: string
  raw: any
  errorMessage?: string
}

function extractJson(text: string): any {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || trimmed
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
  }
  return JSON.parse(candidate)
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`AI provider request failed: ${response.status} ${response.statusText} ${body}`)
  }
  return response.json()
}

async function callGeminiJson(input: TextGenerationInput): Promise<any> {
  const key = getRequiredEnv('GEMINI_API_KEY')
  const route = resolveAiProviderRoute(input.region)
  const model = input.model || route.analysisModel
  const url = `${getGeminiApiBase()}/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const payload = {
    systemInstruction: {
      parts: [{ text: input.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: input.userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
  }

  const json = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = json?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '{}'
  return extractJson(text)
}

async function callQwenJson(input: TextGenerationInput): Promise<any> {
  const key = getRequiredEnv('DASHSCOPE_API_KEY')
  const route = resolveAiProviderRoute(input.region)
  const model = input.model || route.analysisModel
  const url = `${getDashScopeCompatibleBase(input.region)}/chat/completions`
  const json = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
  })

  const text = json?.choices?.[0]?.message?.content || '{}'
  return extractJson(typeof text === 'string' ? text : JSON.stringify(text))
}

export async function generateStructuredJson(input: TextGenerationInput): Promise<any> {
  if (input.region === 'CN') {
    return callQwenJson(input)
  }
  return callGeminiJson(input)
}

function mapPosterSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case '4:5':
      return '1024*1280'
    case '16:9':
      return '1280*720'
    case '9:16':
      return '720*1280'
    default:
      return '1024*1024'
  }
}

function mapOpenAiImageSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case '16:9':
      return '1536x1024'
    case '9:16':
    case '4:5':
      return '1024x1536'
    default:
      return '1024x1024'
  }
}

function normalizeWanVideoDuration(durationSeconds: number): number {
  if (durationSeconds === 5 || durationSeconds === 10) {
    return durationSeconds
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 5) {
    return 5
  }
  return 10
}


export async function submitPosterGeneration(input: {
  region: AiRegion
  prompt: string
  negativePrompt?: string
  aspectRatio: string
  model?: string
}): Promise<MediaTaskSubmission> {
  const route = resolveAiProviderRoute(input.region)

  if (route.posterProvider === 'aliyun-wanx-image') {
    const key = getRequiredEnv('DASHSCOPE_API_KEY')
    const model = input.model || route.posterModel
    const json = await fetchJson(`${getDashScopeApiBase(input.region)}/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: input.prompt,
          negative_prompt: input.negativePrompt,
        },
        parameters: {
          size: mapPosterSize(input.aspectRatio),
          n: 1,
        },
      }),
    })

    const taskId = json?.output?.task_id || json?.task_id
    if (!taskId) {
      throw new Error('Aliyun image generation did not return a task id')
    }

    return {
      status: 'pending',
      provider: route.posterProvider,
      model,
      taskId,
      raw: json,
    }
  }

  const key = getRequiredEnv('OPENAI_API_KEY')
  const model = input.model || route.posterModel
  const json = await fetchJson(`${getOpenAiApiBase()}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size: mapOpenAiImageSize(input.aspectRatio),
      quality: 'high',
    }),
  })

  const item = json?.data?.[0]
  if (!item) {
    throw new Error('OpenAI image generation returned no image data')
  }

  if (item.b64_json) {
    return {
      status: 'completed',
      provider: route.posterProvider,
      model,
      bytes: Buffer.from(item.b64_json, 'base64'),
      mimeType: 'image/png',
      raw: json,
    }
  }

  if (item.url) {
    return {
      status: 'completed',
      provider: route.posterProvider,
      model,
      remoteUrl: item.url,
      mimeType: 'image/png',
      raw: json,
    }
  }

  throw new Error('OpenAI image generation returned neither base64 nor url')
}

export async function pollPosterGeneration(input: {
  region: AiRegion
  provider: AiProvider
  model: string
  taskId: string
}): Promise<MediaTaskPollResult> {
  if (input.provider !== 'aliyun-wanx-image') {
    throw new Error(`Poster polling is not supported for provider ${input.provider}`)
  }

  const key = getRequiredEnv('DASHSCOPE_API_KEY')
  const json = await fetchJson(`${getDashScopeApiBase(input.region)}/tasks/${input.taskId}`, {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  })

  const status = json?.output?.task_status || json?.task_status
  if (status === 'SUCCEEDED') {
    const remoteUrl = json?.output?.results?.[0]?.url || json?.output?.results?.[0]?.orig_url
    if (!remoteUrl) {
      throw new Error('Aliyun image task succeeded but no output url was returned')
    }

    return {
      status: 'completed',
      provider: input.provider,
      model: input.model,
      remoteUrl,
      mimeType: 'image/png',
      raw: json,
    }
  }

  if (status === 'FAILED' || status === 'CANCELED') {
    return {
      status: 'failed',
      provider: input.provider,
      model: input.model,
      raw: json,
      errorMessage: json?.output?.message || 'Aliyun image task failed',
    }
  }

  return {
    status: 'pending',
    provider: input.provider,
    model: input.model,
    raw: json,
  }
}

export async function submitVideoGeneration(input: {
  region: AiRegion
  prompt: string
  aspectRatio: '16:9' | '9:16'
  durationSeconds: number
  model?: string
}): Promise<MediaTaskSubmission> {
  const route = resolveAiProviderRoute(input.region)

  if (route.videoProvider === 'aliyun-wanx-video') {
    const key = getRequiredEnv('DASHSCOPE_API_KEY')
    const model = input.model || route.videoModel
    const durationSeconds = normalizeWanVideoDuration(input.durationSeconds)
    const json = await fetchJson(`${getDashScopeApiBase(input.region)}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: input.prompt,
        },
        parameters: {
          size: input.aspectRatio === '9:16' ? '720*1280' : '1280*720',
          duration: durationSeconds,
        },
      }),
    })

    const taskId = json?.output?.task_id || json?.task_id
    if (!taskId) {
      throw new Error('Aliyun video generation did not return a task id')
    }

    return {
      status: 'pending',
      provider: route.videoProvider,
      model,
      taskId,
      raw: json,
    }
  }

  const key = getRequiredEnv('GEMINI_API_KEY')
  const model = input.model || route.videoModel
  const json = await fetchJson(`${getGeminiApiBase()}/models/${model}:predictLongRunning?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: input.prompt,
        },
      ],
      parameters: {
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
      },
    }),
  })

  const taskId = json?.name
  if (!taskId) {
    throw new Error('Gemini video generation did not return an operation name')
  }

  return {
    status: 'pending',
    provider: route.videoProvider,
    model,
    taskId,
    raw: json,
  }
}

export async function pollVideoGeneration(input: {
  region: AiRegion
  provider: AiProvider
  model: string
  taskId: string
}): Promise<MediaTaskPollResult> {
  if (input.provider === 'aliyun-wanx-video') {
    const key = getRequiredEnv('DASHSCOPE_API_KEY')
    const json = await fetchJson(`${getDashScopeApiBase(input.region)}/tasks/${input.taskId}`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    })

    const status = json?.output?.task_status || json?.task_status
    if (status === 'SUCCEEDED') {
      const remoteUrl = json?.output?.video_url || json?.output?.results?.[0]?.url || json?.output?.video?.url
      if (!remoteUrl) {
        throw new Error('Aliyun video task succeeded but no video url was returned')
      }

      return {
        status: 'completed',
        provider: input.provider,
        model: input.model,
        remoteUrl,
        mimeType: 'video/mp4',
        raw: json,
      }
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      return {
        status: 'failed',
        provider: input.provider,
        model: input.model,
        raw: json,
        errorMessage: json?.output?.message || 'Aliyun video task failed',
      }
    }

    return {
      status: 'pending',
      provider: input.provider,
      model: input.model,
      raw: json,
    }
  }

  const key = getRequiredEnv('GEMINI_API_KEY')
  const json = await fetchJson(`${getGeminiApiBase()}/${input.taskId}?key=${encodeURIComponent(key)}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (json?.done === true) {
    const response = json?.response || {}
    const remoteUrl =
      response?.generatedVideos?.[0]?.video?.uri ||
      response?.generated_videos?.[0]?.video?.uri ||
      response?.videos?.[0]?.uri ||
      response?.video?.uri

    if (json?.error) {
      return {
        status: 'failed',
        provider: input.provider,
        model: input.model,
        raw: json,
        errorMessage: json.error.message || 'Gemini video task failed',
      }
    }

    if (!remoteUrl) {
      return {
        status: 'failed',
        provider: input.provider,
        model: input.model,
        raw: json,
        errorMessage: 'Gemini video task completed without a downloadable url',
      }
    }

    return {
      status: 'completed',
      provider: input.provider,
      model: input.model,
      remoteUrl,
      mimeType: 'video/mp4',
      raw: json,
    }
  }

  return {
    status: 'pending',
    provider: input.provider,
    model: input.model,
    raw: json,
  }
}




