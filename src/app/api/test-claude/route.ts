import { NextResponse } from "next/server";
import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'ANTHROPIC_API_KEY not found',
        env: Object.keys(process.env).filter(k => k.includes('ANTH'))
      }, { status: 500 });
    }

    console.log('🔑 API Key présente:', apiKey.substring(0, 10) + '...');

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Réponds juste "OK"' }],
    });

    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : 'No text';

    return NextResponse.json({ 
      success: true,
      response,
      keyLength: apiKey.length 
    });

  } catch (error: any) {
    console.error('❌ Claude test error:', error);
    return NextResponse.json({ 
      error: error.message,
      status: error.status,
      type: error.type
    }, { status: 500 });
  }
}
