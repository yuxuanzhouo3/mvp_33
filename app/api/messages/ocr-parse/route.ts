import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentRegion } from '@/config'

export const runtime = 'nodejs'

async function getAuthenticatedUser(request: NextRequest) {
  const region = getDeploymentRegion()
  if (region === 'CN') {
    const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
    return await verifyCloudBaseSession(request)
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }
}

/**
 * POST /api/messages/ocr-parse
 * Receives a base64 image of a chat screenshot and uses AI vision to extract messages.
 * Body: { image: string (base64 data URL) }
 * Returns: { success: true, messages: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { image } = body

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'image (base64 data URL) is required' }, { status: 400 })
    }

    const apiKey = process.env.DASHSCOPE_API_KEY
    const apiBase = process.env.DASHSCOPE_COMPAT_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    // Use vision-capable model for OCR
    const visionModel = 'qwen-vl-max'

    const systemPrompt = `你是一个聊天记录 OCR 提取专家。用户会发送聊天截图，你需要从中提取所有聊天消息。

请严格按照以下 JSON 格式返回结果，不要包含任何其他文字：
{
  "messages": [
    {
      "senderName": "发送者姓名",
      "content": "消息内容",
      "rawTimestamp": "原始时间（如果能看到的话，看不到就留空字符串）"
    }
  ]
}

规则：
1. 按照截图中的消息顺序提取
2. 准确识别每条消息的发送者和内容
3. 如果看到时间信息，提取原始时间文本
4. 如果消息包含图片/表情/文件等非文字内容，用 [图片]、[表情]、[文件] 等标记
5. 忽略系统提示消息（如"以下是xxx的聊天记录"）
6. 只返回 JSON，不要有任何其他说明文字`

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: image },
              },
              {
                type: 'text',
                text: '请提取这张聊天截图中的所有消息，严格按照 JSON 格式返回。',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[OCR Parse] AI API error:', response.status, errText)
      return NextResponse.json(
        { error: `AI service error (${response.status})` },
        { status: 502 }
      )
    }

    const aiResult = await response.json()
    const rawContent = aiResult.choices?.[0]?.message?.content || ''

    // Extract JSON from the response (might be wrapped in markdown code blocks)
    let jsonStr = rawContent
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Try to find JSON object in the text
      const objectMatch = rawContent.match(/\{[\s\S]*\}/)
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0])
        } catch {
          return NextResponse.json({
            success: false,
            error: 'AI 未能正确解析截图内容，请尝试更清晰的截图',
            rawResponse: rawContent.slice(0, 500),
          })
        }
      } else {
        return NextResponse.json({
          success: false,
          error: 'AI 未能识别截图中的聊天消息',
          rawResponse: rawContent.slice(0, 500),
        })
      }
    }

    const messages = (parsed.messages || []).map((msg: any, index: number) => ({
      senderName: String(msg.senderName || msg.sender || '未知'),
      content: String(msg.content || msg.message || ''),
      timestamp: new Date().toISOString(),
      rawTimestamp: String(msg.rawTimestamp || msg.time || ''),
      sourceFormat: 'ocr' as const,
    })).filter((msg: any) => msg.content.trim())

    return NextResponse.json({
      success: true,
      messages,
      total: messages.length,
    })
  } catch (error: any) {
    console.error('[API /api/messages/ocr-parse] Error:', error)
    return NextResponse.json({ error: error.message || 'OCR parse failed' }, { status: 500 })
  }
}
